import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { UpdateEntrepriseDto } from './dto/update-entreprise.dto.js';

@Injectable()
export class EntrepriseService {
  constructor(private readonly prisma: PrismaService) {}

  async getEntreprise(entrepriseId: string) {
    return this.prisma.entreprise.findUniqueOrThrow({ where: { id: entrepriseId } });
  }

  async updateEntreprise(entrepriseId: string, dto: UpdateEntrepriseDto) {
    return this.prisma.entreprise.update({ where: { id: entrepriseId }, data: { nom: dto.nom } });
  }
}
