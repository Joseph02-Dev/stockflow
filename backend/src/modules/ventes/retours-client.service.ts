import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import {
  MouvementsService,
  type AlerteANotifier,
  type TransactionPrisma,
} from '../mouvements/mouvements.service.js';
import { RetoursFournisseurService } from '../retours/retours-fournisseur.service.js';
import { SoldesService } from './soldes.service.js';
import type { RetourClientDto } from './dto/retour-client.dto.js';

/** Ligne de vente figée, telle que lue pour calculer un retour. */
interface LigneFigee {
  quantite: number;
  prixUnitaire: number;
  tauxTva: number;
}

/**
 * Montant réellement facturé pour `quantite` unités d'une ligne : prix
 * figé, remise de la vente au prorata, TVA du taux de la ligne. Entiers
 * uniquement (BigInt), arrondi au plus proche, demi vers le haut.
 */
function montantFacture(
  ligne: LigneFigee,
  quantite: number,
  vente: { sousTotal: number; remise: number },
): number {
  if (vente.sousTotal <= 0 || quantite <= 0) return 0;
  const numerateur =
    BigInt(quantite * ligne.prixUnitaire) *
    BigInt(vente.sousTotal - vente.remise) *
    BigInt(100 + ligne.tauxTva);
  const denominateur = BigInt(vente.sousTotal) * 100n;
  return Number((numerateur * 2n + denominateur) / (denominateur * 2n));
}

/**
 * Retour de marchandise par un client, sur une vente validée. Tout se fait
 * dans une transaction : la marchandise rentre (RETOUR_CLIENT), puis, selon
 * son état, reste en stock, ressort en casse (CASSE, valeur au prix
 * d'achat) ou repart chez le fournisseur (retour fournisseur, avoir
 * attendu). Jamais de perte sans mouvement : le stock net d'une casse est
 * inchangé, mais les deux mouvements sont tracés.
 */
@Injectable()
export class RetoursClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mouvements: MouvementsService,
    private readonly retoursFournisseur: RetoursFournisseurService,
    private readonly soldes: SoldesService,
  ) {}

  async retourner(
    entrepriseId: string,
    utilisateurId: string,
    venteId: string,
    dto: RetourClientDto,
  ) {
    const ids = dto.lignes.map((l) => l.ligneVenteId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Une même ligne de vente apparaît deux fois dans le retour.',
      );
    }
    if (dto.etat === 'RETOUR_FOURNISSEUR') {
      await this.retoursFournisseur.verifierFournisseur(
        entrepriseId,
        dto.fournisseurId!,
      );
    }

    const { retourId, alertes } = await this.prisma.$transaction((tx) =>
      this.retournerDansTransaction(
        tx,
        entrepriseId,
        utilisateurId,
        venteId,
        dto,
      ),
    );
    for (const alerte of alertes)
      await this.mouvements.notifierAlerte(entrepriseId, alerte);

    const retour = await this.prisma.retourClient.findUniqueOrThrow({
      where: { id: retourId },
      include: {
        lignes: { include: { ligneVente: { select: { libelle: true } } } },
        vente: {
          select: { id: true, numero: true, clientId: true, total: true },
        },
      },
    });
    const { _sum } = await this.prisma.reglement.aggregate({
      where: { venteId },
      _sum: { montant: true },
    });
    return {
      ...retour,
      resteDuVente: retour.vente.total - (_sum.montant ?? 0),
      soldeClient: retour.vente.clientId
        ? await this.soldes.solde(entrepriseId, retour.vente.clientId)
        : null,
    };
  }

  private async retournerDansTransaction(
    tx: TransactionPrisma,
    entrepriseId: string,
    utilisateurId: string,
    venteId: string,
    dto: RetourClientDto,
  ) {
    // Verrou de la vente : deux retours (ou un retour et un règlement)
    // simultanés passent l'un après l'autre.
    await tx.$queryRaw`SELECT id FROM vente WHERE id = ${venteId} FOR UPDATE`;
    const vente = await tx.vente.findUnique({
      where: { id: venteId },
      include: {
        lignes: { include: { retours: { select: { quantite: true } } } },
      },
    });
    if (!vente || vente.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Vente introuvable.');
    }
    if (vente.statut !== 'VALIDEE') {
      throw new ConflictException(
        'Une vente annulée ne peut plus faire l’objet d’un retour.',
      );
    }

    // Quantités et montants : jamais plus que vendu (moins les retours
    // précédents), au prix réellement facturé sur la ligne d'origine.
    const lignes = dto.lignes.map((demande) => {
      const ligne = vente.lignes.find((l) => l.id === demande.ligneVenteId);
      if (!ligne) {
        throw new BadRequestException(
          'Cette ligne n’appartient pas à la vente.',
        );
      }
      const dejaRetourne = ligne.retours.reduce((a, r) => a + r.quantite, 0);
      const retournable = ligne.quantite - dejaRetourne;
      if (demande.quantite > retournable) {
        throw new BadRequestException(
          `On ne peut pas retourner plus que vendu pour « ${ligne.libelle} » : ${retournable} retournable(s), ${demande.quantite} demandé(s).`,
        );
      }
      const montant =
        montantFacture(ligne, dejaRetourne + demande.quantite, vente) -
        montantFacture(ligne, dejaRetourne, vente);
      return { ligne, quantite: demande.quantite, montant };
    });
    const { _sum: dejaRembourse } = await tx.retourClient.aggregate({
      where: { venteId },
      _sum: { montant: true },
    });
    // Garde-fou d'arrondi : l'ensemble des retours ne dépasse jamais le total.
    const montant = Math.min(
      lignes.reduce((a, l) => a + l.montant, 0),
      vente.total - (dejaRembourse.montant ?? 0),
    );

    let reglementId: string | undefined;
    if (dto.compensation === 'DEDUIRE_DETTE') {
      if (!vente.clientId) {
        throw new BadRequestException(
          'Vente sans client : le retour ne peut être que remboursé.',
        );
      }
      const { _sum } = await tx.reglement.aggregate({
        where: { venteId },
        _sum: { montant: true },
      });
      const resteDu = vente.total - (_sum.montant ?? 0);
      if (montant > resteDu) {
        throw new BadRequestException(
          `Le retour vaut ${montant} GNF mais le reste dû de la vente n’est que de ${resteDu} GNF : remboursez le client en espèces.`,
        );
      }
      if (montant > 0) {
        const reglement = await tx.reglement.create({
          data: { venteId, montant, mode: 'AVOIR', utilisateurId },
        });
        reglementId = reglement.id;
      }
    }

    const retour = await tx.retourClient.create({
      data: {
        entrepriseId,
        venteId,
        utilisateurId,
        etat: dto.etat,
        compensation: dto.compensation,
        montant,
        reglementId,
        lignes: {
          create: lignes.map((l) => ({
            ligneVenteId: l.ligne.id,
            quantite: l.quantite,
            montant: l.montant,
          })),
        },
      },
    });

    const alertes: AlerteANotifier[] = [];
    const versFournisseur: {
      produitId: string;
      quantite: number;
      lotId?: string;
    }[] = [];
    for (const { ligne, quantite } of lignes) {
      const parts = await this.repartirParLot(
        tx,
        entrepriseId,
        venteId,
        ligne.produitId,
        vente.emplacementId,
        quantite,
      );
      const { prixAchat } = await tx.produit.findUniqueOrThrow({
        where: { id: ligne.produitId },
        select: { prixAchat: true },
      });
      for (const part of parts) {
        await this.mouvements.entreeDansTransaction(
          tx,
          entrepriseId,
          utilisateurId,
          {
            produitId: ligne.produitId,
            emplacementId: vente.emplacementId,
            quantite: part.quantite,
          },
          {
            lotId: part.lotId,
            venteId,
            type: 'RETOUR_CLIENT',
            donnees: {
              retourClientId: retour.id,
              commentaire: dto.commentaire,
            },
          },
        );
        if (dto.etat === 'CASSE') {
          const sortie = await this.mouvements.sortieDansTransaction(
            tx,
            entrepriseId,
            utilisateurId,
            {
              produitId: ligne.produitId,
              emplacementId: vente.emplacementId,
              quantite: part.quantite,
            },
            {
              type: 'CASSE',
              lotId: part.lotId,
              donnees: {
                motifPerte: dto.motifPerte,
                valeurUnitaire: prixAchat ?? 0,
                commentaire:
                  dto.commentaire ?? `Retour client — vente ${vente.numero}`,
                retourClientId: retour.id,
              },
            },
          );
          if (sortie.alerteANotifier) alertes.push(sortie.alerteANotifier);
        } else if (dto.etat === 'RETOUR_FOURNISSEUR') {
          versFournisseur.push({
            produitId: ligne.produitId,
            quantite: part.quantite,
            lotId: part.lotId,
          });
        }
      }
    }

    if (versFournisseur.length > 0) {
      const renvoi = await this.retoursFournisseur.creerDansTransaction(
        tx,
        entrepriseId,
        utilisateurId,
        dto.fournisseurId!,
        vente.emplacementId,
        dto.commentaire ?? `Retour client — vente ${vente.numero}`,
        versFournisseur,
        { retourClientId: retour.id },
      );
      alertes.push(...renvoi.alertes);
      await tx.retourClient.update({
        where: { id: retour.id },
        data: { retourFournisseurId: renvoi.id },
      });
    }

    return { retourId: retour.id, alertes };
  }

  /**
   * Produit suivi par lot : la quantité retourne dans les lots que la vente
   * a consommés, déduction faite des retours précédents. Vente antérieure
   * au suivi : lot sans date. Produit sans suivi : une seule part, sans lot.
   */
  private async repartirParLot(
    tx: TransactionPrisma,
    entrepriseId: string,
    venteId: string,
    produitId: string,
    emplacementId: string,
    quantite: number,
  ): Promise<{ lotId?: string; quantite: number }[]> {
    const [sorties, retours] = await Promise.all([
      tx.mouvement.findMany({
        where: { venteId, produitId, type: 'SORTIE', lotId: { not: null } },
        orderBy: { createdAt: 'asc' },
        select: { lotId: true, quantite: true },
      }),
      tx.mouvement.findMany({
        where: {
          venteId,
          produitId,
          type: 'RETOUR_CLIENT',
          lotId: { not: null },
        },
        select: { lotId: true, quantite: true },
      }),
    ]);
    const disponible = new Map<string, number>();
    for (const s of sorties)
      disponible.set(s.lotId!, (disponible.get(s.lotId!) ?? 0) + s.quantite);
    for (const r of retours)
      disponible.set(r.lotId!, (disponible.get(r.lotId!) ?? 0) - r.quantite);

    const parts: { lotId?: string; quantite: number }[] = [];
    let reste = quantite;
    for (const [lotId, libre] of disponible) {
      if (reste === 0) break;
      const prise = Math.min(libre, reste);
      if (prise <= 0) continue;
      parts.push({ lotId, quantite: prise });
      reste -= prise;
    }
    if (reste > 0) {
      parts.push({
        lotId: await this.mouvements.lotSansDateSiSuivi(
          tx,
          entrepriseId,
          produitId,
          emplacementId,
        ),
        quantite: reste,
      });
    }
    return parts;
  }
}
