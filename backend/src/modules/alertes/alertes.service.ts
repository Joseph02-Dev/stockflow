import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';

@Injectable()
export class AlertesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ALERT-003 — Consultation des alertes.
   * Par défaut, seules les alertes ACTIVE sont retournées : c'est ce dont
   * l'utilisateur a besoin au quotidien. Les alertes résolues restent
   * consultables via ?statut=RESOLUE (historique).
   */
  async lister(entrepriseId: string, statut?: 'ACTIVE' | 'RESOLUE') {
    return this.prisma.alerte.findMany({
      where: { entrepriseId, statut: statut ?? 'ACTIVE' },
      include: { produit: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
