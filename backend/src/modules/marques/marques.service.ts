import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { CreateMarqueDto } from './dto/create-marque.dto.js';

@Injectable()
export class MarquesService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(entrepriseId: string) {
    return this.prisma.marque.findMany({ where: { entrepriseId }, orderBy: { nom: 'asc' } });
  }

  async creer(entrepriseId: string, dto: CreateMarqueDto) {
    const existante = await this.prisma.marque.findUnique({
      where: { entrepriseId_nom: { entrepriseId, nom: dto.nom } },
    });
    if (existante) {
      throw new ConflictException('Une marque porte déjà ce nom.');
    }
    return this.prisma.marque.create({ data: { entrepriseId, nom: dto.nom } });
  }

  async modifier(entrepriseId: string, marqueId: string, dto: CreateMarqueDto) {
    await this.trouverOuEchouer(entrepriseId, marqueId);
    return this.prisma.marque.update({ where: { id: marqueId }, data: { nom: dto.nom } });
  }

  async supprimer(entrepriseId: string, marqueId: string) {
    await this.trouverOuEchouer(entrepriseId, marqueId);
    const produitsAssocies = await this.prisma.produit.count({ where: { marqueId } });
    if (produitsAssocies > 0) {
      throw new ConflictException(
        `Cette marque est utilisée par ${produitsAssocies} produit(s) et ne peut pas être supprimée.`,
      );
    }
    await this.prisma.marque.delete({ where: { id: marqueId } });
    return { message: 'Marque supprimée.' };
  }

  private async trouverOuEchouer(entrepriseId: string, marqueId: string) {
    const marque = await this.prisma.marque.findUnique({ where: { id: marqueId } });
    if (!marque || marque.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Marque introuvable.');
    }
    return marque;
  }
}
