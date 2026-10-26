import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { RecevoirCommandeDto } from './dto/recevoir-commande.dto.js';
import { PrismaService } from '../../config/prisma.service.js';
import {
  DEJA_ENREGISTRE,
  operationDejaAppliquee,
} from '../mouvements/operations-hors-ligne.js';
import { refusNumerosSerie } from '../lots/strategie-sortie.js';
import { MouvementsService } from '../mouvements/mouvements.service.js';
import { RangementService } from '../rangement/rangement.service.js';
import { ReceptionNotificationService } from './reception-notification.service.js';
import type { CreateCommandeDto } from './dto/create-commande.dto.js';
import type { UpdateCommandeDto } from './dto/update-commande.dto.js';

@Injectable()
export class CommandesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mouvementsService: MouvementsService,
    private readonly rangement: RangementService,
    private readonly notification: ReceptionNotificationService,
  ) {}

  /**
   * Création manuelle ou pré-remplie depuis les alertes (décision
   * validée) — les deux passent par cette même route, la distinction
   * n'existe que côté frontend selon l'origine de la saisie des lignes.
   */
  async creer(entrepriseId: string, utilisateurId: string, dto: CreateCommandeDto) {
    if (dto.fournisseurId && dto.nouveauFournisseur) {
      throw new BadRequestException('Choisissez un fournisseur existant ou un nouveau fournisseur, pas les deux.');
    }
    if (dto.fournisseurId) await this.verifierFournisseur(entrepriseId, dto.fournisseurId);
    await this.verifierEmplacement(entrepriseId, dto.emplacementId);
    await this.verifierProduitsDeLEntreprise(entrepriseId, dto.lignes);

    return this.prisma.$transaction(async (tx) => {
      // Nouveau fournisseur saisi par son nom : créé avec la commande (même
      // transaction), ou repris s'il existe déjà sous ce nom.
      let fournisseurId = dto.fournisseurId!;
      if (dto.nouveauFournisseur) {
        const nom = dto.nouveauFournisseur.nom;
        const existant = await tx.fournisseur.findFirst({
          where: { entrepriseId, nom: { equals: nom, mode: 'insensitive' } },
          select: { id: true },
        });
        fournisseurId = existant?.id ?? (await tx.fournisseur.create({ data: { entrepriseId, nom }, select: { id: true } })).id;
      }
      const commande = await tx.commandeFournisseur.create({
        data: {
          entrepriseId,
          fournisseurId,
          emplacementId: dto.emplacementId,
          utilisateurId,
        },
      });
      await tx.commandeLigne.createMany({
        data: dto.lignes.map((l) => ({
          commandeId: commande.id,
          produitId: l.produitId,
          quantiteCommandee: l.quantiteCommandee,
        })),
      });
      return commande;
    });
  }

  async lister(entrepriseId: string, filtres: { fournisseurId?: string; statut?: string }) {
    const elements = await this.prisma.commandeFournisseur.findMany({
      where: { entrepriseId, fournisseurId: filtres.fournisseurId, statut: filtres.statut as never },
      include: {
        fournisseur: { select: { id: true, nom: true } },
        emplacement: { select: { id: true, nom: true } },
        utilisateur: { select: { id: true, nom: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Lignes des seules commandes listées : nombre de références et valeur
    // estimée (quantités × prix d'achat actuel — aucun prix n'est figé sur
    // la commande). Un produit sans prix d'achat rend la valeur incomplète.
    const lignes = await this.prisma.commandeLigne.findMany({
      where: { commandeId: { in: elements.map((e) => e.id) } },
      select: { commandeId: true, quantiteCommandee: true, produit: { select: { prixAchat: true } } },
    });
    const parId = new Map<string, { lignes: number; valeur: number; incomplete: boolean }>();
    for (const ligne of lignes) {
      const cumul = parId.get(ligne.commandeId) ?? { lignes: 0, valeur: 0, incomplete: false };
      cumul.lignes += 1;
      if (ligne.produit.prixAchat == null) cumul.incomplete = true;
      else cumul.valeur += ligne.quantiteCommandee * ligne.produit.prixAchat;
      parId.set(ligne.commandeId, cumul);
    }
    return elements.map((e) => {
      const cumul = parId.get(e.id);
      return {
        ...e,
        _count: { lignes: cumul?.lignes ?? 0 },
        valeurEstimee: cumul?.valeur ?? 0,
        valeurIncomplete: cumul?.incomplete ?? false,
      };
    });
  }

  async obtenir(entrepriseId: string, commandeId: string) {
    const commande = await this.trouverOuEchouer(entrepriseId, commandeId);
    const lignes = await this.prisma.commandeLigne.findMany({
      where: { commandeId },
      include: {
        produit: {
          select: { id: true, nom: true, reference: true, uniteMesure: true, suiviParLot: true, suiviParSerie: true },
        },
      },
      orderBy: { produit: { nom: 'asc' } },
    });
    const fournisseur = await this.prisma.fournisseur.findUniqueOrThrow({
      where: { id: commande.fournisseurId },
      select: { id: true, nom: true },
    });
    const emplacement = await this.prisma.emplacement.findUniqueOrThrow({
      where: { id: commande.emplacementId },
      select: { id: true, nom: true },
    });
    return { ...commande, fournisseur, emplacement, lignes };
  }

  /** Remplace entièrement les lignes — uniquement pendant BROUILLON. */
  async modifier(entrepriseId: string, commandeId: string, dto: UpdateCommandeDto) {
    const commande = await this.trouverOuEchouer(entrepriseId, commandeId);
    if (commande.statut !== 'BROUILLON') {
      throw new ConflictException('Seule une commande en brouillon peut être modifiée.');
    }
    await this.verifierProduitsDeLEntreprise(entrepriseId, dto.lignes);

    return this.prisma.$transaction(async (tx) => {
      await tx.commandeLigne.deleteMany({ where: { commandeId } });
      await tx.commandeLigne.createMany({
        data: dto.lignes.map((l) => ({
          commandeId,
          produitId: l.produitId,
          quantiteCommandee: l.quantiteCommandee,
        })),
      });
      return tx.commandeFournisseur.findUniqueOrThrow({ where: { id: commandeId } });
    });
  }

  /** Verrouille la commande — plus aucune modification des lignes possible. */
  async envoyer(entrepriseId: string, commandeId: string) {
    const commande = await this.trouverOuEchouer(entrepriseId, commandeId);
    if (commande.statut !== 'BROUILLON') {
      throw new ConflictException('Seule une commande en brouillon peut être envoyée.');
    }
    return this.prisma.commandeFournisseur.update({
      where: { id: commandeId },
      data: { statut: 'ENVOYEE', envoyeeAt: new Date() },
    });
  }

  /**
   * Réception : crée une entrée de stock pour chaque ligne (décision
   * validée) en réutilisant MouvementsService.entree(), déjà testée —
   * plutôt que de dupliquer la logique de mise à jour du stock et de
   * déclenchement des alertes. Si une ligne échoue (produit archivé
   * entre-temps, etc.), aucune entrée n'est appliquée : la commande
   * reste ENVOYEE, à corriger avant nouvelle tentative.
   */
  async recevoir(entrepriseId: string, utilisateurId: string, commandeId: string, dto: RecevoirCommandeDto = {}) {
    // Réception saisie hors ligne et renvoyée (réponse perdue) : déjà faite.
    if (await operationDejaAppliquee(this.prisma, entrepriseId, dto.idClient)) {
      return DEJA_ENREGISTRE;
    }
    const commande = await this.trouverOuEchouer(entrepriseId, commandeId);
    if (commande.statut !== 'ENVOYEE') {
      throw new ConflictException('Seule une commande envoyée peut être marquée comme reçue.');
    }
    const lignes = await this.prisma.commandeLigne.findMany({
      where: { commandeId },
      include: { produit: { select: { nom: true, suiviParLot: true, suiviParSerie: true } } },
    });

    // Produits suivis par lot : numéro et date exigés pour chacun, vérifiés
    // AVANT toute entrée pour ne jamais réceptionner une commande à moitié.
    // Produits suivis par série : un numéro par unité reçue.
    const lotParProduit = new Map((dto.lots ?? []).map((l) => [l.produitId, l]));
    const manquants = lignes.filter((l) => {
      const lot = lotParProduit.get(l.produitId);
      if (l.produit.suiviParSerie) return !lot?.numerosSerie?.length;
      return l.produit.suiviParLot && !(lot?.numeroLot && lot.datePeremption);
    });
    if (manquants.length > 0) {
      throw new BadRequestException(
        `Numéro de lot et date de péremption (ou numéros de série) requis pour : ${manquants.map((l) => l.produit.nom).join(', ')}.`,
      );
    }
    for (const ligne of lignes.filter((l) => l.produit.suiviParSerie)) {
      const refus = refusNumerosSerie(lotParProduit.get(ligne.produitId)!.numerosSerie!, ligne.quantiteCommandee);
      if (refus) throw new BadRequestException(`${ligne.produit.nom} : ${refus}`);
    }

    for (const ligne of lignes) {
      const lot = ligne.produit.suiviParLot ? lotParProduit.get(ligne.produitId) : undefined;
      // Règles de rangement (module « rangement ») : la marchandise va
      // directement à son emplacement de rangement.
      const rangement = await this.rangement.proposer(entrepriseId, ligne.produitId, commande.emplacementId);
      await this.mouvementsService.entree(entrepriseId, utilisateurId, {
        produitId: ligne.produitId,
        emplacementId: rangement?.id ?? commande.emplacementId,
        quantite: ligne.quantiteCommandee,
        fournisseurId: commande.fournisseurId,
        ...(lot && ligne.produit.suiviParSerie
          ? { numerosSerie: lot.numerosSerie, ...(lot.datePeremption ? { datePeremption: lot.datePeremption } : {}) }
          : lot
            ? { numeroLot: lot.numeroLot!.trim(), datePeremption: lot.datePeremption }
            : {}),
      });
    }

    const recue = await this.prisma.commandeFournisseur.update({
      where: { id: commandeId },
      data: { statut: 'RECUE', recueAt: new Date() },
    });
    // Inscrite après coup : un renvoi simultané est de toute façon refusé
    // par le contrôle de statut ci-dessus (commande déjà RECUE).
    if (dto.idClient) {
      await this.prisma.operationHorsLigne
        .create({ data: { entrepriseId, idClient: dto.idClient, nature: 'reception' } })
        .catch(() => undefined);
    }
    await this.notification.notifier(entrepriseId, utilisateurId, commandeId);
    return recue;
  }

  /** Annulation possible avant réception — jamais après (le stock a déjà bougé). */
  async annuler(entrepriseId: string, commandeId: string) {
    const commande = await this.trouverOuEchouer(entrepriseId, commandeId);
    if (commande.statut === 'RECUE' || commande.statut === 'ANNULEE') {
      throw new ConflictException('Cette commande ne peut plus être annulée.');
    }
    return this.prisma.commandeFournisseur.update({
      where: { id: commandeId },
      data: { statut: 'ANNULEE' },
    });
  }

  private async verifierFournisseur(entrepriseId: string, fournisseurId: string) {
    const fournisseur = await this.prisma.fournisseur.findUnique({ where: { id: fournisseurId } });
    if (!fournisseur || fournisseur.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Fournisseur introuvable.');
    }
  }

  private async verifierEmplacement(entrepriseId: string, emplacementId: string) {
    const emplacement = await this.prisma.emplacement.findUnique({ where: { id: emplacementId } });
    if (!emplacement || emplacement.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Emplacement introuvable.');
    }
    if (emplacement.archive) {
      throw new ConflictException('Cet emplacement est archivé.');
    }
  }

  private async verifierProduitsDeLEntreprise(entrepriseId: string, lignes: { produitId: string }[]) {
    const produits = await this.prisma.produit.findMany({
      where: { id: { in: lignes.map((l) => l.produitId) } },
    });
    const trouves = new Map(produits.map((p) => [p.id, p]));
    for (const ligne of lignes) {
      const produit = trouves.get(ligne.produitId);
      if (!produit || produit.entrepriseId !== entrepriseId) {
        throw new NotFoundException('Produit introuvable.');
      }
      if (produit.archive) {
        throw new ConflictException(`Le produit « ${produit.nom} » est archivé et ne peut pas être commandé.`);
      }
    }
  }

  private async trouverOuEchouer(entrepriseId: string, commandeId: string) {
    const commande = await this.prisma.commandeFournisseur.findUnique({ where: { id: commandeId } });
    if (!commande || commande.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Commande introuvable.');
    }
    return commande;
  }
}
