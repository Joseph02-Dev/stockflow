import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import type { Pagination } from '../../common/pagination/pagination.js';
import { comparerFefo, debutJour, joursRestants } from './fefo.js';

/** Tranches de l'écran Péremptions, de la plus urgente à la moins urgente. */
export const TRANCHES = ['PERIME', 'MOINS_7', 'DE_8_A_30', 'PLUS_30'] as const;
export type Tranche = (typeof TRANCHES)[number];

const JOUR_MS = 86_400_000;

/** Tranche d'un lot selon ses jours restants (0 à 7 inclus : moins de 7 jours). */
export function trancheDe(jours: number): Tranche {
  if (jours < 0) return 'PERIME';
  if (jours <= 7) return 'MOINS_7';
  if (jours <= 30) return 'DE_8_A_30';
  return 'PLUS_30';
}

/**
 * Lecture des lots : écran Péremptions (statut calculé à la lecture,
 * jamais stocké ni mis à jour par une tâche planifiée) et lots d'un
 * produit. Seuls les lots non vides et datés y figurent.
 */
@Injectable()
export class LotsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Par tranche : nombre de lots, unités et valeur au prix d'achat (GNF),
   * plus le nombre de lots « sous surveillance » (péremption dans le
   * seuil du produit, ou à défaut de l'entreprise, périmés compris).
   */
  async resume(entrepriseId: string, maintenant = new Date()) {
    const aujourdhui = debutJour(maintenant);
    const borne = (jours: number) =>
      new Date(aujourdhui.getTime() + jours * JOUR_MS);
    const lignes = await this.prisma.$queryRaw<
      { tranche: Tranche; lots: number; unites: number; valeur: number }[]
    >`
      SELECT CASE
               WHEN l.date_peremption < ${aujourdhui} THEN 'PERIME'
               WHEN l.date_peremption < ${borne(8)} THEN 'MOINS_7'
               WHEN l.date_peremption < ${borne(31)} THEN 'DE_8_A_30'
               ELSE 'PLUS_30'
             END AS tranche,
             count(*)::int AS lots,
             sum(l.quantite)::int AS unites,
             sum(l.quantite::bigint * coalesce(p.prix_achat, 0))::float8 AS valeur
      FROM lot l JOIN produit p ON p.id = l.produit_id
      WHERE l.entreprise_id = ${entrepriseId}
        AND l.quantite > 0 AND l.date_peremption IS NOT NULL
      GROUP BY 1`;
    const parTranche = new Map(lignes.map((l) => [l.tranche, l]));

    const entreprise = await this.prisma.entreprise.findUniqueOrThrow({
      where: { id: entrepriseId },
      select: { seuilAlertePeremptionJours: true },
    });

    return {
      seuilJours: entreprise.seuilAlertePeremptionJours,
      sousSurveillance: await this.compterSousSurveillance(
        entrepriseId,
        aujourdhui,
        entreprise.seuilAlertePeremptionJours,
      ),
      tranches: TRANCHES.map((tranche) => ({
        tranche,
        lots: parTranche.get(tranche)?.lots ?? 0,
        unites: parTranche.get(tranche)?.unites ?? 0,
        valeur: parTranche.get(tranche)?.valeur ?? 0,
      })),
    };
  }

  /** Nombre de lots sous surveillance (pastille de la navigation). */
  async compterSousSurveillance(
    entrepriseId: string,
    aujourdhui: Date,
    seuilEntreprise: number,
  ): Promise<number> {
    const [{ nombre }] = await this.prisma.$queryRaw<{ nombre: number }[]>`
      SELECT count(*)::int AS nombre
      FROM lot l JOIN produit p ON p.id = l.produit_id
      WHERE l.entreprise_id = ${entrepriseId}
        AND l.quantite > 0 AND l.date_peremption IS NOT NULL
        AND l.date_peremption <= ${aujourdhui}::timestamp
          + make_interval(days => coalesce(p.seuil_alerte_peremption, ${seuilEntreprise}::int))`;
    return nombre;
  }

  /** Lots datés et non vides, le plus urgent d'abord, filtrables par tranche. */
  async listerPeremptions(
    entrepriseId: string,
    tranche: string | undefined,
    pagination: Pagination,
    maintenant = new Date(),
  ) {
    if (tranche !== undefined && !TRANCHES.includes(tranche as Tranche)) {
      throw new BadRequestException('Tranche de péremption inconnue.');
    }
    const aujourdhui = debutJour(maintenant);
    const borne = (jours: number) =>
      new Date(aujourdhui.getTime() + jours * JOUR_MS);
    const plage = {
      PERIME: { lt: aujourdhui },
      MOINS_7: { gte: aujourdhui, lt: borne(8) },
      DE_8_A_30: { gte: borne(8), lt: borne(31) },
      PLUS_30: { gte: borne(31) },
    }[tranche as Tranche] ?? { not: null };

    const lots = await this.prisma.lot.findMany({
      where: { entrepriseId, quantite: { gt: 0 }, datePeremption: plage },
      select: {
        id: true,
        numero: true,
        quantite: true,
        datePeremption: true,
        recuAt: true,
        produit: {
          select: {
            id: true,
            nom: true,
            reference: true,
            photoUrl: true,
            prixAchat: true,
            prixVente: true,
            uniteMesure: true,
          },
        },
        emplacement: { select: { id: true, nom: true } },
      },
      orderBy: [{ datePeremption: 'asc' }, { recuAt: 'asc' }, { id: 'asc' }],
      ...pagination,
    });
    const fournisseurs = await this.fournisseursDesLots(lots);

    return lots.map((lot) => {
      const jours = joursRestants(lot.datePeremption!, maintenant);
      return {
        ...lot,
        joursRestants: jours,
        tranche: trancheDe(jours),
        valeur: lot.quantite * (lot.produit.prixAchat ?? 0),
        fournisseur:
          fournisseurs.get(`${lot.produit.id}|${lot.numero}`) ?? null,
      };
    });
  }

  /**
   * Lots en stock d'un produit (fiche produit, réception), dans l'ordre
   * FEFO de chaque emplacement ; le premier de chacun « sortira en
   * premier ».
   */
  async lotsDuProduit(
    entrepriseId: string,
    produitId: string,
    emplacementId?: string,
    maintenant = new Date(),
  ) {
    const lots = await this.prisma.lot.findMany({
      where: {
        entrepriseId,
        produitId,
        emplacementId,
        quantite: { gt: 0 },
      },
      select: {
        id: true,
        numero: true,
        quantite: true,
        datePeremption: true,
        recuAt: true,
        emplacement: { select: { id: true, nom: true } },
      },
    });
    lots.sort(
      (a, b) =>
        a.emplacement.nom.localeCompare(b.emplacement.nom) ||
        comparerFefo(a, b),
    );
    const premiers = new Set<string>();
    return lots.map((lot) => {
      const premier = !premiers.has(lot.emplacement.id);
      premiers.add(lot.emplacement.id);
      return {
        ...lot,
        joursRestants: lot.datePeremption
          ? joursRestants(lot.datePeremption, maintenant)
          : null,
        sortiraEnPremier: premier,
      };
    });
  }

  /**
   * Fournisseur d'un lot : celui de l'entrée qui l'a créé. Un lot
   * transféré garde son numéro : on retrouve l'entrée d'origine par
   * (produit, numéro), quel que soit l'emplacement.
   */
  private async fournisseursDesLots(
    lots: { numero: string; produit: { id: string } }[],
  ) {
    if (lots.length === 0)
      return new Map<string, { id: string; nom: string }>();
    const entrees = await this.prisma.mouvement.findMany({
      where: {
        type: 'ENTREE',
        fournisseurId: { not: null },
        lot: {
          produitId: { in: [...new Set(lots.map((l) => l.produit.id))] },
          numero: { in: [...new Set(lots.map((l) => l.numero))] },
        },
      },
      select: {
        produitId: true,
        lot: { select: { numero: true } },
        fournisseur: { select: { id: true, nom: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const resultat = new Map<string, { id: string; nom: string }>();
    for (const e of entrees) {
      const cle = `${e.produitId}|${e.lot!.numero}`;
      if (!resultat.has(cle) && e.fournisseur) resultat.set(cle, e.fournisseur);
    }
    return resultat;
  }
}
