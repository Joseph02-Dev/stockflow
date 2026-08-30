import { Injectable, NotFoundException } from '@nestjs/common';
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
      orderBy: { nom: 'asc' },
    });
  }

  async creer(entrepriseId: string, dto: CreateProduitDto) {
    return this.prisma.produit.create({
      data: {
        entrepriseId,
        nom: dto.nom,
        reference: dto.reference,
        seuilAlerte: dto.seuilAlerte ?? 0,
      },
    });
  }

  async modifier(entrepriseId: string, produitId: string, dto: UpdateProduitDto) {
    await this.trouverOuEchouer(entrepriseId, produitId);
    return this.prisma.produit.update({ where: { id: produitId }, data: dto });
  }

  /** PROD-004 — Archivage (jamais de suppression physique). */
  async archiver(entrepriseId: string, produitId: string) {
    await this.trouverOuEchouer(entrepriseId, produitId);
    return this.prisma.produit.update({ where: { id: produitId }, data: { archive: true } });
  }

  private async trouverOuEchouer(entrepriseId: string, produitId: string) {
    const produit = await this.prisma.produit.findUnique({ where: { id: produitId } });
    if (!produit || produit.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Produit introuvable.');
    }
    return produit;
  }
}
