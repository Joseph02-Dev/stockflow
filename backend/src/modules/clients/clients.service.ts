import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { CreateClientDto } from './dto/create-client.dto.js';
import type { UpdateClientDto } from './dto/update-client.dto.js';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(entrepriseId: string, options: { search?: string; inclureArchives: boolean }) {
    const recherche = options.search?.trim();
    return this.prisma.client.findMany({
      where: {
        entrepriseId,
        ...(options.inclureArchives ? {} : { archive: false }),
        ...(recherche
          ? {
              OR: [
                { nom: { contains: recherche, mode: 'insensitive' } },
                { nomCommerce: { contains: recherche, mode: 'insensitive' } },
                { telephone: { contains: recherche } },
              ],
            }
          : {}),
      },
      orderBy: { nom: 'asc' },
    });
  }

  async obtenir(entrepriseId: string, clientId: string) {
    return this.trouverOuEchouer(entrepriseId, clientId);
  }

  async creer(entrepriseId: string, dto: CreateClientDto) {
    return this.prisma.client.create({
      data: {
        entrepriseId,
        nom: dto.nom.trim(),
        telephone: dto.telephone?.trim(),
        nomCommerce: dto.nomCommerce?.trim(),
        categorie: dto.categorie,
        plafondCredit: dto.plafondCredit,
      },
    });
  }

  async modifier(entrepriseId: string, clientId: string, dto: UpdateClientDto) {
    await this.trouverOuEchouer(entrepriseId, clientId);
    return this.prisma.client.update({
      where: { id: clientId },
      data: {
        nom: dto.nom?.trim(),
        telephone: typeof dto.telephone === 'string' ? dto.telephone.trim() : dto.telephone,
        nomCommerce: typeof dto.nomCommerce === 'string' ? dto.nomCommerce.trim() : dto.nomCommerce,
        categorie: dto.categorie,
        plafondCredit: dto.plafondCredit,
      },
    });
  }

  /**
   * Archivage, jamais de suppression : un client a un historique de
   * ventes et de règlements qui doit survivre. Un client archivé
   * disparaît des listes et des nouvelles ventes, pas de l'historique.
   */
  async archiver(entrepriseId: string, clientId: string) {
    await this.trouverOuEchouer(entrepriseId, clientId);
    return this.prisma.client.update({ where: { id: clientId }, data: { archive: true } });
  }

  async trouverOuEchouer(entrepriseId: string, clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client || client.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Client introuvable.');
    }
    return client;
  }
}
