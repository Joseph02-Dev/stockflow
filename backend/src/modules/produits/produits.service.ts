import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { LimitesService } from '../../common/limites/limites.service.js';
import type { CreateProduitDto } from './dto/create-produit.dto.js';
import type { UpdateProduitDto } from './dto/update-produit.dto.js';
import { NUMERO_LOT_SANS_DATE, type TransactionPrisma } from '../mouvements/mouvements.service.js';

@Injectable()
export class ProduitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limites: LimitesService,
  ) {}

  /**
   * PROD-003 — Recherche / filtre. `search` filtre sur le nom (insensible
   * à la casse) ; `archive` (false par défaut) exclut les produits
   * archivés des usages courants, sans jamais les supprimer.
   */
  async lister(entrepriseId: string, options: { search?: string; inclureArchives: boolean }) {
    return this.prisma.produit.findMany({
      where: {
        entrepriseId,
        ...(options.inclureArchives ? {} : { archive: false }),
        ...(options.search ? { nom: { contains: options.search, mode: 'insensitive' } } : {}),
      },
      include: { categorie: true, marque: true },
      orderBy: { nom: 'asc' },
    });
  }

  async obtenir(entrepriseId: string, produitId: string) {
    const produit = await this.prisma.produit.findUnique({
      where: { id: produitId },
      include: {
        categorie: true,
        marque: true,
        // Nécessaire pour le widget « Fournisseur habituel » de la fiche
        // produit — pas de champ dédié, on réutilise l'association déjà
        // existante plutôt que d'ajouter un concept de fournisseur
        // "principal" qui n'a jamais été validé.
        fournisseursAssocies: { include: { fournisseur: true } },
      },
    });
    if (!produit || produit.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Produit introuvable.');
    }
    return produit;
  }

  async creer(entrepriseId: string, dto: CreateProduitDto) {
    await this.limites.exigerPlace(entrepriseId, 'references');
    await this.verifierReferences(entrepriseId, dto);
    // Si aucun taux n'est fourni, on reprend le défaut défini par
    // l'entreprise (renseigné à l'inscription) plutôt que de laisser le
    // champ vide à chaque nouveau produit — champ réellement exploité,
    // pas seulement collecté à l'inscription pour la forme.
    let tauxTva = dto.tauxTva;
    if (tauxTva === undefined) {
      const entreprise = await this.prisma.entreprise.findUnique({
        where: { id: entrepriseId },
        select: { tauxTvaParDefaut: true },
      });
      tauxTva = entreprise?.tauxTvaParDefaut ?? undefined;
    }
    try {
      return await this.prisma.produit.create({
        data: {
          entrepriseId,
          nom: dto.nom,
          reference: dto.reference,
          seuilAlerte: dto.seuilAlerte ?? 0,
          photoUrl: dto.photoUrl,
          prixAchat: dto.prixAchat,
          prixVente: dto.prixVente,
          prixGros: dto.prixGros,
          prixDemiGros: dto.prixDemiGros,
          tauxTva,
          codeBarre: dto.codeBarre,
          uniteMesure: dto.uniteMesure,
          description: dto.description,
          categorieId: dto.categorieId,
          marqueId: dto.marqueId,
          suiviParLot: dto.suiviParLot,
          seuilAlertePeremption: dto.seuilAlertePeremption,
        },
        include: { categorie: true, marque: true },
      });
    } catch (erreur) {
      throw this.traduireErreurCodeBarre(erreur);
    }
  }

  async modifier(entrepriseId: string, produitId: string, dto: UpdateProduitDto) {
    const actuel = await this.trouverOuEchouer(entrepriseId, produitId);
    await this.verifierReferences(entrepriseId, dto);
    const bascule = dto.suiviParLot !== undefined && dto.suiviParLot !== actuel.suiviParLot;
    try {
      if (!bascule) {
        return await this.prisma.produit.update({
          where: { id: produitId },
          data: dto,
          include: { categorie: true, marque: true },
        });
      }
      // La mise à jour du produit verrouille sa ligne : les mouvements,
      // qui la lisent « FOR SHARE », attendent la fin de la bascule et
      // voient tous le même état du suivi par lot.
      return await this.prisma.$transaction(async (tx) => {
        const produit = await tx.produit.update({
          where: { id: produitId },
          data: dto,
          include: { categorie: true, marque: true },
        });
        if (dto.suiviParLot) await this.activerSuiviParLot(tx, entrepriseId, produitId);
        else await this.exigerAucunLotEnStock(tx, produitId);
        return produit;
      });
    } catch (erreur) {
      throw this.traduireErreurCodeBarre(erreur);
    }
  }

  /**
   * Activation du suivi : le stock déjà présent à chaque emplacement
   * devient un lot « sans date » (aucune date à inventer), qui sortira
   * en dernier. Ainsi Stock = Σ lots dès l'activation.
   */
  private async activerSuiviParLot(tx: TransactionPrisma, entrepriseId: string, produitId: string) {
    const stocks = await tx.$queryRaw<{ emplacementId: string; quantite: number }[]>`
      SELECT emplacement_id AS "emplacementId", quantite FROM stock
      WHERE produit_id = ${produitId} AND quantite > 0 FOR UPDATE`;
    for (const stock of stocks) {
      const { _sum } = await tx.lot.aggregate({
        where: { produitId, emplacementId: stock.emplacementId },
        _sum: { quantite: true },
      });
      const horsLot = stock.quantite - (_sum.quantite ?? 0);
      if (horsLot <= 0) continue;
      await tx.lot.upsert({
        where: {
          produitId_emplacementId_numero: { produitId, emplacementId: stock.emplacementId, numero: NUMERO_LOT_SANS_DATE },
        },
        create: { entrepriseId, produitId, emplacementId: stock.emplacementId, numero: NUMERO_LOT_SANS_DATE, quantite: horsLot },
        update: { quantite: { increment: horsLot } },
      });
    }
  }

  /** Désactivation refusée tant qu'un lot contient encore du stock. */
  private async exigerAucunLotEnStock(tx: TransactionPrisma, produitId: string) {
    const { _count, _sum } = await tx.lot.aggregate({
      where: { produitId, quantite: { gt: 0 } },
      _count: { _all: true },
      _sum: { quantite: true },
    });
    if (_count._all > 0) {
      throw new ConflictException(
        `Ce produit a encore ${_count._all} lot${_count._all > 1 ? 's' : ''} en stock (${_sum.quantite} unités) : vendez-les, transférez-les ou sortez-les avant de désactiver le suivi par lot.`,
      );
    }
  }

  /** PROD-004 — Archivage (jamais de suppression physique). */
  async archiver(entrepriseId: string, produitId: string) {
    await this.trouverOuEchouer(entrepriseId, produitId);
    return this.prisma.produit.update({ where: { id: produitId }, data: { archive: true } });
  }

  /**
   * Une catégorie ou une marque appartenant à une autre entreprise ne
   * doit jamais pouvoir être associée à un produit — même si son
   * identifiant est deviné.
   */
  private async verifierReferences(entrepriseId: string, dto: CreateProduitDto | UpdateProduitDto) {
    if (dto.categorieId) {
      const categorie = await this.prisma.categorie.findUnique({ where: { id: dto.categorieId } });
      if (!categorie || categorie.entrepriseId !== entrepriseId) {
        throw new NotFoundException('Catégorie introuvable.');
      }
    }
    if (dto.marqueId) {
      const marque = await this.prisma.marque.findUnique({ where: { id: dto.marqueId } });
      if (!marque || marque.entrepriseId !== entrepriseId) {
        throw new NotFoundException('Marque introuvable.');
      }
    }
  }

  /** Transforme la violation de contrainte d'unicité (code-barre) en erreur lisible. */
  private traduireErreurCodeBarre(erreur: unknown): unknown {
    const estErreurPrisma =
      erreur instanceof Object && 'code' in erreur && (erreur as { code: unknown }).code === 'P2002';
    if (estErreurPrisma) {
      return new ConflictException('Ce code-barre est déjà utilisé par un autre produit.');
    }
    return erreur;
  }

  private async trouverOuEchouer(entrepriseId: string, produitId: string) {
    const produit = await this.prisma.produit.findUnique({ where: { id: produitId } });
    if (!produit || produit.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Produit introuvable.');
    }
    return produit;
  }
}
