import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { MouvementsService } from '../mouvements/mouvements.service.js';
import type { CreateCommandeDto } from './dto/create-commande.dto.js';
import type { UpdateCommandeDto } from './dto/update-commande.dto.js';

@Injectable()
export class CommandesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mouvementsService: MouvementsService,
  ) {}

  /**
   * Création manuelle ou pré-remplie depuis les alertes (décision
   * validée) — les deux passent par cette même route, la distinction
   * n'existe que côté frontend selon l'origine de la saisie des lignes.
   */
  async creer(entrepriseId: string, utilisateurId: string, dto: CreateCommandeDto) {
    await this.verifierFournisseur(entrepriseId, dto.fournisseurId);
    await this.verifierEmplacement(entrepriseId, dto.emplacementId);
    await this.verifierProduitsDeLEntreprise(entrepriseId, dto.lignes);

    return this.prisma.$transaction(async (tx) => {
      const commande = await tx.commandeFournisseur.create({
        data: {
          entrepriseId,
          fournisseurId: dto.fournisseurId,
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
    return this.prisma.commandeFournisseur.findMany({
      where: { entrepriseId, fournisseurId: filtres.fournisseurId, statut: filtres.statut as never },
      include: {
        fournisseur: { select: { id: true, nom: true } },
        emplacement: { select: { id: true, nom: true } },
        utilisateur: { select: { id: true, nom: true } },
        _count: { select: { lignes: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async obtenir(entrepriseId: string, commandeId: string) {
    const commande = await this.trouverOuEchouer(entrepriseId, commandeId);
    const lignes = await this.prisma.commandeLigne.findMany({
      where: { commandeId },
      include: { produit: { select: { id: true, nom: true, reference: true, uniteMesure: true } } },
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
  async recevoir(entrepriseId: string, utilisateurId: string, commandeId: string) {
    const commande = await this.trouverOuEchouer(entrepriseId, commandeId);
    if (commande.statut !== 'ENVOYEE') {
      throw new ConflictException('Seule une commande envoyée peut être marquée comme reçue.');
    }
    const lignes = await this.prisma.commandeLigne.findMany({ where: { commandeId } });

    for (const ligne of lignes) {
      await this.mouvementsService.entree(entrepriseId, utilisateurId, {
        produitId: ligne.produitId,
        emplacementId: commande.emplacementId,
        quantite: ligne.quantiteCommandee,
        fournisseurId: commande.fournisseurId,
      });
    }

    return this.prisma.commandeFournisseur.update({
      where: { id: commandeId },
      data: { statut: 'RECUE', recueAt: new Date() },
    });
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
