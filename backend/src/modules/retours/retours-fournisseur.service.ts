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
import type {
  CreerRetourFournisseurDto,
  LigneRetourFournisseurDto,
} from './dto/retours.dto.js';

const SELECTION_RETOUR = {
  id: true,
  motif: true,
  valeurTotale: true,
  statutAvoir: true,
  avoirRecuAt: true,
  refuseAt: true,
  createdAt: true,
  fournisseur: { select: { id: true, nom: true } },
  emplacement: { select: { id: true, nom: true } },
  utilisateur: { select: { id: true, nom: true } },
  mouvements: {
    select: {
      id: true,
      quantite: true,
      valeurUnitaire: true,
      valeurTotale: true,
      produit: { select: { id: true, nom: true, photoUrl: true } },
      lot: { select: { numero: true } },
    },
  },
} as const;

/**
 * Renvoi de marchandise au fournisseur. Le stock sort au renvoi (valeur
 * figée au prix d'achat) ; l'avoir est ensuite reçu ou refusé, sans
 * aucun mouvement de stock : un refus ne fait que classer la valeur en
 * perte (synthèse des pertes), une seule fois.
 */
@Injectable()
export class RetoursFournisseurService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mouvements: MouvementsService,
  ) {}

  async creer(
    entrepriseId: string,
    utilisateurId: string,
    dto: CreerRetourFournisseurDto,
  ) {
    await this.verifierFournisseur(entrepriseId, dto.fournisseurId);
    for (const ligne of dto.lignes) {
      await this.mouvements.verifierProduitEtEmplacement(
        entrepriseId,
        ligne.produitId,
        dto.emplacementId,
      );
    }
    const { id, alertes } = await this.prisma.$transaction((tx) =>
      this.creerDansTransaction(
        tx,
        entrepriseId,
        utilisateurId,
        dto.fournisseurId,
        dto.emplacementId,
        dto.motif,
        dto.lignes,
      ),
    );
    for (const alerte of alertes)
      await this.mouvements.notifierAlerte(entrepriseId, alerte);
    return this.prisma.retourFournisseur.findUniqueOrThrow({
      where: { id },
      select: SELECTION_RETOUR,
    });
  }

  /**
   * Cœur de la création, dans une transaction fournie (le retour client
   * « renvoyer au fournisseur » l'appelle dans la sienne).
   */
  async creerDansTransaction(
    tx: TransactionPrisma,
    entrepriseId: string,
    utilisateurId: string,
    fournisseurId: string,
    emplacementId: string,
    motif: string,
    lignes: LigneRetourFournisseurDto[],
    options: { retourClientId?: string } = {},
  ) {
    const retour = await tx.retourFournisseur.create({
      data: {
        entrepriseId,
        fournisseurId,
        emplacementId,
        utilisateurId,
        motif,
        valeurTotale: 0,
      },
    });
    let valeurTotale = 0;
    const alertes: AlerteANotifier[] = [];
    for (const ligne of lignes) {
      const { prixAchat } = await tx.produit.findUniqueOrThrow({
        where: { id: ligne.produitId },
        select: { prixAchat: true },
      });
      const resultat = await this.mouvements.sortieDansTransaction(
        tx,
        entrepriseId,
        utilisateurId,
        { produitId: ligne.produitId, emplacementId, quantite: ligne.quantite },
        {
          type: 'RETOUR_FOURNISSEUR',
          lotId: ligne.lotId,
          donnees: {
            valeurUnitaire: prixAchat ?? 0,
            retourFournisseurId: retour.id,
            retourClientId: options.retourClientId,
          },
        },
      );
      valeurTotale += ligne.quantite * (prixAchat ?? 0);
      if (resultat.alerteANotifier) alertes.push(resultat.alerteANotifier);
    }
    await tx.retourFournisseur.update({
      where: { id: retour.id },
      data: { valeurTotale },
    });
    return { id: retour.id, alertes };
  }

  /** Retours, les plus récents d'abord, avec le total des avoirs en attente. */
  async lister(entrepriseId: string, statut?: string) {
    if (
      statut !== undefined &&
      !['ATTENDU', 'RECU', 'REFUSE'].includes(statut)
    ) {
      throw new BadRequestException('Statut d’avoir inconnu.');
    }
    const [retours, attente] = await Promise.all([
      this.prisma.retourFournisseur.findMany({
        where: {
          entrepriseId,
          statutAvoir: statut as 'ATTENDU' | 'RECU' | 'REFUSE' | undefined,
        },
        select: SELECTION_RETOUR,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
      this.prisma.retourFournisseur.aggregate({
        where: { entrepriseId, statutAvoir: 'ATTENDU' },
        _sum: { valeurTotale: true },
        _count: { _all: true },
      }),
    ]);
    return {
      retours,
      avoirsEnAttente: {
        nombre: attente._count._all,
        valeur: attente._sum.valeurTotale ?? 0,
      },
    };
  }

  /**
   * Avoir reçu ou refusé : seulement depuis « attendu », et sans aucun
   * mouvement de stock — le stock est sorti une fois, au renvoi.
   */
  async changerAvoir(
    entrepriseId: string,
    retourId: string,
    statut: 'RECU' | 'REFUSE',
  ) {
    await this.prisma.$transaction(async (tx) => {
      const [ligne] = await tx.$queryRaw<
        { entreprise_id: string; statut_avoir: string }[]
      >`
        SELECT entreprise_id, statut_avoir FROM retour_fournisseur WHERE id = ${retourId} FOR UPDATE`;
      if (!ligne || ligne.entreprise_id !== entrepriseId)
        throw new NotFoundException('Retour introuvable.');
      if (ligne.statut_avoir !== 'ATTENDU') {
        throw new ConflictException('L’avoir de ce retour a déjà été traité.');
      }
      await tx.retourFournisseur.update({
        where: { id: retourId },
        data:
          statut === 'RECU'
            ? { statutAvoir: 'RECU', avoirRecuAt: new Date() }
            : { statutAvoir: 'REFUSE', refuseAt: new Date() },
      });
    });
    return this.prisma.retourFournisseur.findUniqueOrThrow({
      where: { id: retourId },
      select: SELECTION_RETOUR,
    });
  }

  async verifierFournisseur(entrepriseId: string, fournisseurId: string) {
    const fournisseur = await this.prisma.fournisseur.findUnique({
      where: { id: fournisseurId },
    });
    if (!fournisseur || fournisseur.entrepriseId !== entrepriseId)
      throw new NotFoundException('Fournisseur introuvable.');
  }
}
