import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';

export interface VenteNonSoldee {
  venteId: string;
  clientId: string;
  numero: string;
  total: number;
  paye: number;
  resteDu: number;
  createdAt: Date;
  echeanceAt: Date | null;
}

/**
 * Soldes clients, toujours calculés, jamais stockés : un champ dénormalisé
 * dériverait au moindre bug et deviendrait impossible à auditer.
 *   solde = Σ total des ventes VALIDEE − Σ règlements de ces ventes
 * (les règlements d'une vente annulée sont réputés remboursés).
 */
@Injectable()
export class SoldesService {
  constructor(private readonly prisma: PrismaService) {}

  async solde(entrepriseId: string, clientId: string): Promise<number> {
    const ventes = await this.ventesNonSoldees(entrepriseId, clientId);
    return ventes.reduce((a, v) => a + v.resteDu, 0);
  }

  /** Ventes VALIDEE avec un reste dû, de la plus ancienne à la plus récente. */
  async ventesNonSoldees(
    entrepriseId: string,
    clientId?: string,
  ): Promise<VenteNonSoldee[]> {
    const lignes = await this.prisma.$queryRaw<
      {
        vente_id: string;
        client_id: string;
        numero: string;
        total: number;
        paye: bigint;
        created_at: Date;
        echeance_at: Date | null;
      }[]
    >`
      SELECT v.id AS vente_id, v.client_id, v.numero, v.total, COALESCE(SUM(r.montant), 0) AS paye,
             v.created_at, v.echeance_at
      FROM vente v
      LEFT JOIN reglement r ON r.vente_id = v.id
      WHERE v.entreprise_id = ${entrepriseId}
        AND v.statut = 'VALIDEE'
        AND v.client_id IS NOT NULL
        AND (${clientId ?? null}::text IS NULL OR v.client_id = ${clientId ?? null})
      GROUP BY v.id
      HAVING v.total > COALESCE(SUM(r.montant), 0)
      ORDER BY v.created_at ASC, v.numero ASC`;
    return lignes.map((l) => {
      const paye = Number(l.paye);
      return {
        venteId: l.vente_id,
        clientId: l.client_id,
        numero: l.numero,
        total: l.total,
        paye,
        resteDu: l.total - paye,
        createdAt: l.created_at,
        echeanceAt: l.echeance_at,
      };
    });
  }
}
