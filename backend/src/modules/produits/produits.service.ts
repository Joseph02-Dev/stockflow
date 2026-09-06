import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { CreateProduitDto } from './dto/create-produit.dto.js';
import type { UpdateProduitDto } from './dto/update-produit.dto.js';

@Injectable()
export class ProduitsService {
  constructor(private readonly prisma: PrismaService) {}

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
      include: { categorie: true, marque: true },
    });
    if (!produit || produit.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Produit introuvable.');
    }
    return produit;
  }

  async creer(entrepriseId: string, dto: CreateProduitDto) {
    await this.verifierReferences(entrepriseId, dto);
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
          tauxTva: dto.tauxTva,
          codeBarre: dto.codeBarre,
          description: dto.description,
          categorieId: dto.categorieId,
          marqueId: dto.marqueId,
        },
        include: { categorie: true, marque: true },
      });
    } catch (erreur) {
      throw this.traduireErreurCodeBarre(erreur);
    }
  }

  async modifier(entrepriseId: string, produitId: string, dto: UpdateProduitDto) {
    await this.trouverOuEchouer(entrepriseId, produitId);
    await this.verifierReferences(entrepriseId, dto);
    try {
      return await this.prisma.produit.update({
        where: { id: produitId },
        data: dto,
        include: { categorie: true, marque: true },
      });
    } catch (erreur) {
      throw this.traduireErreurCodeBarre(erreur);
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
