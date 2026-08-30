import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { CreateFournisseurDto } from './dto/create-fournisseur.dto.js';
import type { UpdateFournisseurDto } from './dto/update-fournisseur.dto.js';

@Injectable()
export class FournisseursService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(entrepriseId: string) {
    return this.prisma.fournisseur.findMany({ where: { entrepriseId }, orderBy: { nom: 'asc' } });
  }

  async obtenir(entrepriseId: string, fournisseurId: string) {
    return this.trouverOuEchouer(entrepriseId, fournisseurId);
  }

  async creer(entrepriseId: string, dto: CreateFournisseurDto) {
    return this.prisma.fournisseur.create({
      data: { entrepriseId, nom: dto.nom, emailContact: dto.emailContact, telephone: dto.telephone },
    });
  }

  async modifier(entrepriseId: string, fournisseurId: string, dto: UpdateFournisseurDto) {
    await this.trouverOuEchouer(entrepriseId, fournisseurId);
    return this.prisma.fournisseur.update({ where: { id: fournisseurId }, data: dto });
  }

  /**
   * FOUR-002 — Associe un produit à un fournisseur.
   * Vérifie que le produit appartient bien à la même entreprise que le
   * fournisseur, pour éviter qu'un utilisateur associe un produit d'une
   * autre entreprise en devinant son identifiant.
   */
  async associerProduit(entrepriseId: string, fournisseurId: string, produitId: string) {
    await this.trouverOuEchouer(entrepriseId, fournisseurId);

    const produit = await this.prisma.produit.findUnique({ where: { id: produitId } });
    if (!produit || produit.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Produit introuvable.');
    }

    const dejaAssocie = await this.prisma.fournisseurProduit.findUnique({
      where: { fournisseurId_produitId: { fournisseurId, produitId } },
    });
    if (dejaAssocie) {
      throw new ConflictException('Ce produit est déjà associé à ce fournisseur.');
    }

    await this.prisma.fournisseurProduit.create({ data: { fournisseurId, produitId } });
    return { message: 'Produit associé.' };
  }

  async dissocierProduit(entrepriseId: string, fournisseurId: string, produitId: string) {
    await this.trouverOuEchouer(entrepriseId, fournisseurId);
    await this.prisma.fournisseurProduit.deleteMany({ where: { fournisseurId, produitId } });
    return { message: 'Produit dissocié.' };
  }

  async listerProduitsAssocies(entrepriseId: string, fournisseurId: string) {
    await this.trouverOuEchouer(entrepriseId, fournisseurId);
    const associations = await this.prisma.fournisseurProduit.findMany({
      where: { fournisseurId },
      include: { produit: true },
    });
    return associations.map((a) => a.produit);
  }

  private async trouverOuEchouer(entrepriseId: string, fournisseurId: string) {
    const fournisseur = await this.prisma.fournisseur.findUnique({ where: { id: fournisseurId } });
    if (!fournisseur || fournisseur.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Fournisseur introuvable.');
    }
    return fournisseur;
  }
}
