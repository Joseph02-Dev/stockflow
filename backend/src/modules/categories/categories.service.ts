import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { CreateCategorieDto } from './dto/create-categorie.dto.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(entrepriseId: string) {
    return this.prisma.categorie.findMany({ where: { entrepriseId }, orderBy: { nom: 'asc' } });
  }

  async creer(entrepriseId: string, dto: CreateCategorieDto) {
    const existante = await this.prisma.categorie.findUnique({
      where: { entrepriseId_nom: { entrepriseId, nom: dto.nom } },
    });
    if (existante) {
      throw new ConflictException('Une catégorie porte déjà ce nom.');
    }
    return this.prisma.categorie.create({ data: { entrepriseId, nom: dto.nom } });
  }

  async modifier(entrepriseId: string, categorieId: string, dto: CreateCategorieDto) {
    await this.trouverOuEchouer(entrepriseId, categorieId);
    return this.prisma.categorie.update({ where: { id: categorieId }, data: { nom: dto.nom } });
  }

  /**
   * Contrairement aux emplacements/produits, une catégorie n'a pas
   * d'historique propre à préserver — mais on refuse tout de même de
   * supprimer une catégorie encore utilisée par des produits, pour ne
   * jamais orpheliner silencieusement des données de classement.
   */
  async supprimer(entrepriseId: string, categorieId: string) {
    await this.trouverOuEchouer(entrepriseId, categorieId);
    const produitsAssocies = await this.prisma.produit.count({ where: { categorieId } });
    if (produitsAssocies > 0) {
      throw new ConflictException(
        `Cette catégorie est utilisée par ${produitsAssocies} produit(s) et ne peut pas être supprimée.`,
      );
    }
    await this.prisma.categorie.delete({ where: { id: categorieId } });
    return { message: 'Catégorie supprimée.' };
  }

  private async trouverOuEchouer(entrepriseId: string, categorieId: string) {
    const categorie = await this.prisma.categorie.findUnique({ where: { id: categorieId } });
    if (!categorie || categorie.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Catégorie introuvable.');
    }
    return categorie;
  }
}
