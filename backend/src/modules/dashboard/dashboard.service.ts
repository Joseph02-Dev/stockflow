import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * DASH-001 + DASH-002 — Vue d'ensemble.
   * Retourne en une seule requête HTTP les KPI définis en phase UX et la
   * liste des produits actuellement en alerte, pour éviter au frontend
   * d'enchaîner plusieurs appels au chargement du dashboard.
   */
  async overview(entrepriseId: string) {
    const ilYASeptJours = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [produitsActifs, emplacementsActifs, alertesActives, mouvementsRecents, alertes] =
      await Promise.all([
        this.prisma.produit.count({ where: { entrepriseId, archive: false } }),
        this.prisma.emplacement.count({ where: { entrepriseId, archive: false } }),
        this.prisma.alerte.count({ where: { entrepriseId, statut: 'ACTIVE' } }),
        this.prisma.mouvement.count({ where: { entrepriseId, createdAt: { gte: ilYASeptJours } } }),
        this.prisma.alerte.findMany({
          where: { entrepriseId, statut: 'ACTIVE' },
          include: { produit: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    // Quantité totale en stock, tous produits et emplacements confondus.
    const stockAgrege = await this.prisma.stock.aggregate({
      where: { produit: { entrepriseId } },
      _sum: { quantite: true },
    });

    return {
      kpi: {
        produitsActifs,
        emplacementsActifs,
        alertesActives,
        mouvements7Jours: mouvementsRecents,
        quantiteTotaleEnStock: stockAgrege._sum.quantite ?? 0,
      },
      produitsEnAlerte: alertes.map((alerte) => ({
        alerteId: alerte.id,
        produitId: alerte.produitId,
        produitNom: alerte.produit.nom,
        type: alerte.type,
        quantiteAuDeclenchement: alerte.quantiteAuDeclenchement,
        seuilAlerte: alerte.produit.seuilAlerte,
        declencheeLe: alerte.createdAt,
      })),
    };
  }
}
