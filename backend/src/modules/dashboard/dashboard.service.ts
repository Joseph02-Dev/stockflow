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

    const [
      produitsActifs,
      emplacementsActifs,
      alertesActives,
      mouvementsRecents,
      alertes,
    ] = await Promise.all([
      this.prisma.produit.count({ where: { entrepriseId, archive: false } }),
      this.prisma.emplacement.count({
        where: { entrepriseId, archive: false },
      }),
      this.prisma.alerte.count({ where: { entrepriseId, statut: 'ACTIVE' } }),
      this.prisma.mouvement.count({
        where: { entrepriseId, createdAt: { gte: ilYASeptJours } },
      }),
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

  /**
   * Indicateurs du tableau de bord calculés par la base, au lieu de faire
   * télécharger au navigateur tout le stock, tout l'historique des
   * mouvements, toutes les commandes et tous les fournisseurs : la réponse
   * reste de quelques kilo-octets quel que soit le volume de l'entreprise.
   *
   * Mêmes règles qu'avant (calcul autrefois fait côté navigateur) :
   * - valeur immobilisée = Σ quantité × prix d'achat ; lignes en stock sans
   *   prix d'achat comptées à part ;
   * - série sur 9 jours : valeur en fin de journée, reconstituée à rebours
   *   en annulant les mouvements de chaque jour au prix d'achat actuel ;
   * - mouvements des 7 derniers jours et des 7 précédents ;
   * - délai fournisseur moyen, commandes envoyées (« en route ») ;
   * - pour chaque produit en alerte : stock total et emplacement le plus bas.
   */
  async indicateurs(entrepriseId: string) {
    const JOUR_MS = 86_400_000;
    const NB_JOURS = 9;
    const maintenant = new Date();
    const finDuJour = new Date(maintenant);
    finDuJour.setHours(23, 59, 59, 999);
    const debutSerie = new Date(finDuJour.getTime() - NB_JOURS * JOUR_MS);

    const [valeur, variations, semaines, delais, enRoute, stockEnAlerte] =
      await Promise.all([
        this.prisma.$queryRaw<{ valeur: bigint | null; sans_prix: bigint }[]>`
        SELECT SUM(s.quantite::bigint * p.prix_achat) FILTER (WHERE p.prix_achat IS NOT NULL) AS valeur,
               COUNT(*) FILTER (WHERE p.prix_achat IS NULL AND s.quantite > 0) AS sans_prix
        FROM stock s JOIN produit p ON p.id = s.produit_id
        WHERE p.entreprise_id = ${entrepriseId}`,
        this.prisma.$queryRaw<{ jour: number; variation: bigint }[]>`
        SELECT FLOOR(EXTRACT(EPOCH FROM (${finDuJour}::timestamp - m.created_at)) / 86400)::int AS jour,
               SUM(CASE m.type WHEN 'ENTREE' THEN m.quantite WHEN 'SORTIE' THEN -m.quantite
                               WHEN 'AJUSTEMENT' THEN m.quantite ELSE 0 END::bigint * COALESCE(p.prix_achat, 0)) AS variation
        FROM mouvement m JOIN produit p ON p.id = m.produit_id
        WHERE m.entreprise_id = ${entrepriseId} AND m.created_at > ${debutSerie} AND m.created_at <= ${finDuJour}
        GROUP BY 1`,
        this.prisma.$queryRaw<{ semaine: bigint; precedente: bigint }[]>`
        SELECT COUNT(*) FILTER (WHERE created_at >= ${new Date(maintenant.getTime() - 7 * JOUR_MS)}) AS semaine,
               COUNT(*) FILTER (WHERE created_at < ${new Date(maintenant.getTime() - 7 * JOUR_MS)}) AS precedente
        FROM mouvement
        WHERE entreprise_id = ${entrepriseId} AND created_at >= ${new Date(maintenant.getTime() - 14 * JOUR_MS)}`,
        this.prisma.fournisseur.aggregate({
          where: { entrepriseId, delaiLivraisonJours: { not: null } },
          _avg: { delaiLivraisonJours: true },
          _count: { delaiLivraisonJours: true },
        }),
        this.prisma.commandeFournisseur.count({
          where: { entrepriseId, statut: 'ENVOYEE' },
        }),
        this.prisma.$queryRaw<
          {
            produit_id: string;
            quantite: bigint;
            emplacement_bas: string | null;
          }[]
        >`
        SELECT a.produit_id,
               COALESCE(SUM(s.quantite), 0) AS quantite,
               (ARRAY_AGG(e.nom ORDER BY s.quantite ASC))[1] AS emplacement_bas
        FROM alerte a
        LEFT JOIN stock s ON s.produit_id = a.produit_id
        LEFT JOIN emplacement e ON e.id = s.emplacement_id
        WHERE a.entreprise_id = ${entrepriseId} AND a.statut = 'ACTIVE'
        GROUP BY a.produit_id`,
      ]);

    const valeurActuelle = Number(valeur[0]?.valeur ?? 0);
    const variationParJour = new Map(
      variations.map((v) => [v.jour, Number(v.variation)]),
    );
    const serie: number[] = [];
    let valeurCourante = valeurActuelle;
    for (let i = 0; i < NB_JOURS; i += 1) {
      serie.unshift(valeurCourante);
      valeurCourante -= variationParJour.get(i) ?? 0;
    }

    return {
      valeurImmobilisee: valeurActuelle,
      lignesSansPrix: Number(valeur[0]?.sans_prix ?? 0),
      serieValeur: serie,
      mouvementsSemaine: Number(semaines[0]?.semaine ?? 0),
      mouvementsSemainePrecedente: Number(semaines[0]?.precedente ?? 0),
      delaiFournisseurMoyen: delais._avg.delaiLivraisonJours,
      nombreDelais: delais._count.delaiLivraisonJours,
      commandesEnRoute: enRoute,
      stockProduitsEnAlerte: stockEnAlerte.map((l) => ({
        produitId: l.produit_id,
        quantite: Number(l.quantite),
        emplacementBas: l.emplacement_bas,
      })),
    };
  }
}
