import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { Pagination } from '../../common/pagination/pagination.js';
import { ORDRE_RECENT_DABORD } from '../../common/pagination/pagination.js';
import { MouvementsService } from '../mouvements/mouvements.service.js';
import type { DeclarerCasseDto, FiltresPertesDto } from './dto/pertes.dto.js';

/** Champs affichés d'une perte (mouvement CASSE). */
const SELECTION_PERTE = {
  id: true,
  quantite: true,
  motifPerte: true,
  valeurUnitaire: true,
  valeurTotale: true,
  commentaire: true,
  photoUrl: true,
  createdAt: true,
  annuleAt: true,
  motifAnnulation: true,
  retourClientId: true,
  produit: {
    select: {
      id: true,
      nom: true,
      reference: true,
      photoUrl: true,
      uniteMesure: true,
    },
  },
  emplacement: { select: { id: true, nom: true } },
  utilisateur: { select: { id: true, nom: true } },
  annulePar: { select: { id: true, nom: true } },
  lot: { select: { id: true, numero: true } },
} as const;

/**
 * Pertes déclarées (mouvements CASSE). Un gestionnaire déclare librement :
 * chaque déclaration est nominative, immuable, et visible ici. Seul un
 * administrateur l'annule, par un mouvement inverse ; elle reste alors
 * visible, marquée annulée.
 */
@Injectable()
export class PertesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mouvements: MouvementsService,
  ) {}

  /**
   * Déclare une casse : sortie de stock (FEFO, ou lot désigné), motif
   * obligatoire, valeur figée au prix d'achat du moment. Produit suivi par
   * lot : un mouvement par lot traversé.
   */
  async declarer(
    entrepriseId: string,
    utilisateurId: string,
    dto: DeclarerCasseDto,
  ) {
    await this.mouvements.verifierProduitEtEmplacement(
      entrepriseId,
      dto.produitId,
      dto.emplacementId,
    );
    const resultat = await this.prisma.$transaction(async (tx) => {
      const { prixAchat } = await tx.produit.findUniqueOrThrow({
        where: { id: dto.produitId },
        select: { prixAchat: true },
      });
      return this.mouvements.sortieDansTransaction(
        tx,
        entrepriseId,
        utilisateurId,
        {
          produitId: dto.produitId,
          emplacementId: dto.emplacementId,
          quantite: dto.quantite,
        },
        {
          type: 'CASSE',
          lotId: dto.lotId,
          donnees: {
            motifPerte: dto.motif,
            // On perd ce qu'on a payé, pas la marge espérée.
            valeurUnitaire: prixAchat ?? 0,
            commentaire: dto.commentaire,
            photoUrl: dto.photoUrl,
          },
        },
      );
    });
    // Notification après le commit : un email en échec n'annule jamais la déclaration.
    if (resultat.alerteANotifier)
      await this.mouvements.notifierAlerte(
        entrepriseId,
        resultat.alerteANotifier,
      );
    return this.prisma.mouvement.findMany({
      where: { id: { in: resultat.mouvements.map((m) => m.id) } },
      select: SELECTION_PERTE,
    });
  }

  /** Historique des pertes, le plus récent d'abord, filtrable. */
  async lister(
    entrepriseId: string,
    filtres: FiltresPertesDto,
    pagination: Pagination,
  ) {
    return this.prisma.mouvement.findMany({
      where: {
        entrepriseId,
        type: 'CASSE',
        motifPerte: filtres.motif,
        emplacementId: filtres.emplacementId,
        utilisateurId: filtres.utilisateurId,
        createdAt: {
          gte: filtres.debut
            ? new Date(`${filtres.debut}T00:00:00.000Z`)
            : undefined,
          lt: filtres.fin
            ? new Date(
                new Date(`${filtres.fin}T00:00:00.000Z`).getTime() + 86_400_000,
              )
            : undefined,
        },
      },
      select: SELECTION_PERTE,
      orderBy: ORDRE_RECENT_DABORD,
      ...pagination,
    });
  }

  /**
   * Annulation (administrateur) : mouvement inverse — la quantité revient
   * dans le même lot — et déclaration marquée annulée avec son motif. Ses
   * quantités et sa valeur ne changent jamais.
   */
  async annuler(
    entrepriseId: string,
    utilisateurId: string,
    perteId: string,
    motif: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const [verrouillee] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM mouvement WHERE id = ${perteId} FOR UPDATE`;
      const perte = verrouillee
        ? await tx.mouvement.findUnique({ where: { id: perteId } })
        : null;
      if (
        !perte ||
        perte.entrepriseId !== entrepriseId ||
        perte.type !== 'CASSE'
      ) {
        throw new NotFoundException('Perte introuvable.');
      }
      if (perte.annuleAt)
        throw new ConflictException('Cette perte est déjà annulée.');

      // Casse antérieure à l'activation du suivi par lot : rejoint le lot sans date.
      const lotId =
        perte.lotId ??
        (await this.mouvements.lotSansDateSiSuivi(
          tx,
          entrepriseId,
          perte.produitId,
          perte.emplacementId,
        ));
      await this.mouvements.entreeDansTransaction(
        tx,
        entrepriseId,
        utilisateurId,
        {
          produitId: perte.produitId,
          emplacementId: perte.emplacementId,
          quantite: perte.quantite,
        },
        {
          type: 'AJUSTEMENT',
          lotId,
          donnees: {
            commentaire: `Annulation d’une casse : ${motif}`,
            annuleMouvementId: perte.id,
          },
        },
      );
      await tx.mouvement.update({
        where: { id: perte.id },
        data: {
          annuleAt: new Date(),
          annuleParId: utilisateurId,
          motifAnnulation: motif,
        },
      });
    });
    return this.prisma.mouvement.findUniqueOrThrow({
      where: { id: perteId },
      select: SELECTION_PERTE,
    });
  }
}
