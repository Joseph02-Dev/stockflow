import { Injectable, NotFoundException } from '@nestjs/common';
import type { TypeMouvement } from '../../generated/prisma/client.js';
import { PrismaService } from '../../config/prisma.service.js';
import type { Periode } from './dto/statistiques.dto.js';

const JOUR_MS = 86_400_000;
const NB_SEMAINES = 12;
/** Au-delà, les catégories sont regroupées en « Autres » : 5 couleurs restent lisibles. */
const NB_CATEGORIES = 4;
const NB_CLASSEMENT = 5;

/** Effet d'un mouvement sur le stock de l'entreprise (un transfert ne change pas le total). */
function effet(type: TypeMouvement, quantite: number): number {
  if (type === 'TRANSFERT') return 0;
  return type === 'ENTREE' || type === 'RETOUR_CLIENT' || type === 'AJUSTEMENT'
    ? quantite
    : -quantite;
}

/** Bornes de la période demandée et de la précédente, de même durée (UTC, fin exclue). */
export function bornesPeriode(periode: Periode, maintenant = new Date()) {
  const a = maintenant.getUTCFullYear();
  const m = maintenant.getUTCMonth();
  if (periode === '12m') {
    return {
      unite: 'month' as const,
      nombre: 12,
      debut: new Date(Date.UTC(a, m - 11, 1)),
      fin: new Date(Date.UTC(a, m + 1, 1)),
      debutPrecedent: new Date(Date.UTC(a, m - 23, 1)),
    };
  }
  const nombre = periode === '7j' ? 7 : 30;
  const fin = new Date(Date.UTC(a, m, maintenant.getUTCDate() + 1));
  const debut = new Date(fin.getTime() - nombre * JOUR_MS);
  return {
    unite: 'day' as const,
    nombre,
    debut,
    fin,
    debutPrecedent: new Date(debut.getTime() - nombre * JOUR_MS),
  };
}

/**
 * Statistiques de l'écran « Statistiques » : tendance du chiffre d'affaires,
 * indicateurs comparés à la période précédente, produits en plus forte
 * hausse ou baisse, répartitions, et niveau de stock hebdomadaire d'un
 * produit (chandeliers).
 *
 * Conventions :
 * - chiffre d'affaires = total TTC des ventes validées (annulées exclues) ;
 * - valeurs de stock et coût des ventes au prix d'achat actuel du produit
 *   (le prix d'achat n'est pas historisé) ; produits sans prix d'achat ignorés ;
 * - périodes en UTC (heure de Conakry), la période en cours incluse.
 */
@Injectable()
export class StatistiquesService {
  constructor(private readonly prisma: PrismaService) {}

  async resume(entrepriseId: string, periode: Periode) {
    const { unite, nombre, debut, fin, debutPrecedent } =
      bornesPeriode(periode);

    const [
      serie,
      precedent,
      couts,
      valeurStock,
      variationsStock,
      parProduit,
      parCategorie,
      parMode,
      produits,
    ] = await Promise.all([
      this.prisma.$queryRaw<{ debut: Date; montant: bigint; nombre: bigint }[]>`
          SELECT date_trunc(${unite}, created_at) AS debut, SUM(total)::bigint AS montant, COUNT(*) AS nombre
          FROM vente
          WHERE entreprise_id = ${entrepriseId} AND statut = 'VALIDEE' AND created_at >= ${debut} AND created_at < ${fin}
          GROUP BY 1`,
      this.prisma.$queryRaw<{ montant: bigint | null; nombre: bigint }[]>`
          SELECT SUM(total)::bigint AS montant, COUNT(*) AS nombre
          FROM vente
          WHERE entreprise_id = ${entrepriseId} AND statut = 'VALIDEE'
            AND created_at >= ${debutPrecedent} AND created_at < ${debut}`,
      this.prisma.$queryRaw<
        { cout: bigint | null; cout_precedent: bigint | null }[]
      >`
          SELECT SUM(lv.quantite::bigint * p.prix_achat) FILTER (WHERE v.created_at >= ${debut}) AS cout,
                 SUM(lv.quantite::bigint * p.prix_achat) FILTER (WHERE v.created_at < ${debut}) AS cout_precedent
          FROM ligne_vente lv
          JOIN vente v ON v.id = lv.vente_id
          JOIN produit p ON p.id = lv.produit_id
          WHERE v.entreprise_id = ${entrepriseId} AND v.statut = 'VALIDEE' AND p.prix_achat IS NOT NULL
            AND v.created_at >= ${debutPrecedent} AND v.created_at < ${fin}`,
      this.prisma.$queryRaw<{ valeur: bigint | null }[]>`
          SELECT SUM(s.quantite::bigint * p.prix_achat) AS valeur
          FROM stock s JOIN produit p ON p.id = s.produit_id
          WHERE p.entreprise_id = ${entrepriseId} AND p.prix_achat IS NOT NULL`,
      this.prisma.$queryRaw<
        { depuis_debut: bigint | null; depuis_precedent: bigint | null }[]
      >`
          WITH deltas AS (
            SELECT m.created_at,
                   (CASE WHEN m.type IN ('ENTREE', 'RETOUR_CLIENT', 'AJUSTEMENT') THEN m.quantite
                         WHEN m.type = 'TRANSFERT' THEN 0
                         ELSE -m.quantite END)::bigint * p.prix_achat AS valeur
            FROM mouvement m JOIN produit p ON p.id = m.produit_id
            WHERE m.entreprise_id = ${entrepriseId} AND p.prix_achat IS NOT NULL AND m.created_at >= ${debutPrecedent}
          )
          SELECT SUM(valeur) FILTER (WHERE created_at >= ${debut}) AS depuis_debut, SUM(valeur) AS depuis_precedent
          FROM deltas`,
      this.prisma.$queryRaw<
        {
          produit_id: string;
          nom: string;
          montant: bigint | null;
          precedent: bigint | null;
        }[]
      >`
          SELECT lv.produit_id, p.nom,
                 SUM(lv.montant_ligne) FILTER (WHERE v.created_at >= ${debut})::bigint AS montant,
                 SUM(lv.montant_ligne) FILTER (WHERE v.created_at < ${debut})::bigint AS precedent
          FROM ligne_vente lv
          JOIN vente v ON v.id = lv.vente_id
          JOIN produit p ON p.id = lv.produit_id
          WHERE v.entreprise_id = ${entrepriseId} AND v.statut = 'VALIDEE'
            AND v.created_at >= ${debutPrecedent} AND v.created_at < ${fin}
          GROUP BY lv.produit_id, p.nom`,
      this.prisma.$queryRaw<{ categorie: string | null; valeur: bigint }[]>`
          SELECT c.nom AS categorie, SUM(s.quantite::bigint * p.prix_achat)::bigint AS valeur
          FROM stock s
          JOIN produit p ON p.id = s.produit_id
          LEFT JOIN categorie c ON c.id = p.categorie_id
          WHERE p.entreprise_id = ${entrepriseId} AND p.prix_achat IS NOT NULL AND s.quantite > 0
          GROUP BY c.nom`,
      this.prisma.$queryRaw<{ mode: string; montant: bigint }[]>`
          SELECT mode_paiement::text AS mode, SUM(total)::bigint AS montant
          FROM vente
          WHERE entreprise_id = ${entrepriseId} AND statut = 'VALIDEE' AND created_at >= ${debut} AND created_at < ${fin}
          GROUP BY 1`,
      this.prisma.$queryRaw<{ seuil: number; quantite: bigint }[]>`
          SELECT p.seuil_alerte AS seuil, COALESCE(SUM(s.quantite), 0)::bigint AS quantite
          FROM produit p LEFT JOIN stock s ON s.produit_id = p.id
          WHERE p.entreprise_id = ${entrepriseId} AND NOT p.archive
          GROUP BY p.id`,
    ]);

    // Tendance : un point par jour (ou par mois), zéro les jours sans vente.
    const parDebut = new Map(
      serie.map((l) => [new Date(l.debut).getTime(), l]),
    );
    const points = Array.from({ length: nombre }, (_, i) => {
      const date =
        unite === 'month'
          ? new Date(
              Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + i, 1),
            )
          : new Date(debut.getTime() + i * JOUR_MS);
      const ligne = parDebut.get(date.getTime());
      return {
        debut: date.toISOString(),
        montant: Number(ligne?.montant ?? 0),
        ventes: Number(ligne?.nombre ?? 0),
      };
    });
    const chiffreAffaires = points.reduce((total, p) => total + p.montant, 0);
    const nombreVentes = serie.reduce(
      (total, l) => total + Number(l.nombre),
      0,
    );
    const chiffrePrecedent = Number(precedent[0]?.montant ?? 0);
    const ventesPrecedentes = Number(precedent[0]?.nombre ?? 0);

    // Rotation = coût des ventes / valeur moyenne du stock sur la période.
    // Valeur à une date passée = valeur actuelle moins les mouvements depuis.
    const valeurFin = Number(valeurStock[0]?.valeur ?? 0);
    const valeurDebut =
      valeurFin - Number(variationsStock[0]?.depuis_debut ?? 0);
    const valeurDebutPrecedent =
      valeurFin - Number(variationsStock[0]?.depuis_precedent ?? 0);
    const rotation = (cout: number, a: number, b: number) => {
      const moyenne = (a + b) / 2;
      return moyenne > 0 ? Math.round((cout / moyenne) * 100) / 100 : null;
    };

    const lignesProduits = parProduit
      .map((l) => {
        const montant = Number(l.montant ?? 0);
        const anterieur = Number(l.precedent ?? 0);
        return {
          produitId: l.produit_id,
          nom: l.nom,
          montant,
          precedent: anterieur,
          variation:
            anterieur > 0
              ? Math.round(((montant - anterieur) / anterieur) * 1000) / 10
              : null,
        };
      })
      .filter(
        (l): l is typeof l & { variation: number } => l.variation !== null,
      );

    const categories = parCategorie
      .map((l) => ({
        libelle: l.categorie ?? 'Sans catégorie',
        valeur: Number(l.valeur),
      }))
      .sort((a, b) => b.valeur - a.valeur);
    const valeurParCategorie =
      categories.length > NB_CATEGORIES + 1
        ? [
            ...categories.slice(0, NB_CATEGORIES),
            {
              libelle: 'Autres',
              valeur: categories
                .slice(NB_CATEGORIES)
                .reduce((t, c) => t + c.valeur, 0),
            },
          ]
        : categories;

    const etatStock = { enStock: 0, faible: 0, rupture: 0 };
    for (const p of produits) {
      const quantite = Number(p.quantite);
      // Même règle que les alertes : rupture à 0, faible strictement sous le seuil.
      if (quantite <= 0) etatStock.rupture += 1;
      else if (quantite < p.seuil) etatStock.faible += 1;
      else etatStock.enStock += 1;
    }

    return {
      periode,
      debut: debut.toISOString(),
      fin: fin.toISOString(),
      unite,
      tendance: points,
      chiffreAffaires: { valeur: chiffreAffaires, precedent: chiffrePrecedent },
      ventes: { valeur: nombreVentes, precedent: ventesPrecedentes },
      panierMoyen: {
        valeur:
          nombreVentes > 0 ? Math.round(chiffreAffaires / nombreVentes) : null,
        precedent:
          ventesPrecedentes > 0
            ? Math.round(chiffrePrecedent / ventesPrecedentes)
            : null,
      },
      rotation: {
        valeur: rotation(Number(couts[0]?.cout ?? 0), valeurDebut, valeurFin),
        precedent: rotation(
          Number(couts[0]?.cout_precedent ?? 0),
          valeurDebutPrecedent,
          valeurDebut,
        ),
      },
      hausses: lignesProduits
        .filter((l) => l.variation > 0)
        .sort((a, b) => b.variation - a.variation)
        .slice(0, NB_CLASSEMENT),
      baisses: lignesProduits
        .filter((l) => l.variation < 0)
        .sort((a, b) => a.variation - b.variation)
        .slice(0, NB_CLASSEMENT),
      valeurParCategorie,
      ventesParMode: parMode
        .map((l) => ({ mode: l.mode, montant: Number(l.montant) }))
        .sort((a, b) => b.montant - a.montant),
      etatStock,
    };
  }

  /**
   * Niveau de stock d'un produit (tous emplacements) sur les 12 dernières
   * semaines, du lundi au dimanche : ouverture, plus haut, plus bas et
   * clôture. Les niveaux passés sont reconstitués à partir du stock actuel
   * en remontant les mouvements. Sans produitId : le plus vendu.
   */
  async stockHebdomadaire(
    entrepriseId: string,
    produitId?: string,
    maintenant = new Date(),
  ) {
    const aujourdhui = Date.UTC(
      maintenant.getUTCFullYear(),
      maintenant.getUTCMonth(),
      maintenant.getUTCDate(),
    );
    const lundi = aujourdhui - ((maintenant.getUTCDay() + 6) % 7) * JOUR_MS;
    const debut = new Date(lundi - (NB_SEMAINES - 1) * 7 * JOUR_MS);

    const plusVendus = await this.prisma.$queryRaw<
      { id: string; nom: string }[]
    >`
      SELECT p.id, p.nom
      FROM ligne_vente lv
      JOIN vente v ON v.id = lv.vente_id
      JOIN produit p ON p.id = lv.produit_id
      WHERE v.entreprise_id = ${entrepriseId} AND v.statut = 'VALIDEE' AND v.created_at >= ${debut} AND NOT p.archive
      GROUP BY p.id, p.nom
      ORDER BY SUM(lv.quantite) DESC, p.nom
      LIMIT 10`;
    const suggestions =
      plusVendus.length > 0
        ? plusVendus
        : await this.prisma.produit.findMany({
            where: { entrepriseId, archive: false },
            select: { id: true, nom: true },
            orderBy: { nom: 'asc' },
            take: 10,
          });

    const idChoisi = produitId ?? suggestions[0]?.id;
    if (!idChoisi) return { produit: null, produits: [], semaines: [] };

    const produit = await this.prisma.produit.findFirst({
      where: { id: idChoisi, entrepriseId },
      select: { id: true, nom: true, uniteMesure: true },
    });
    if (!produit) throw new NotFoundException('Produit introuvable.');

    const [stock, mouvements] = await Promise.all([
      this.prisma.stock.aggregate({
        where: { produitId: produit.id },
        _sum: { quantite: true },
      }),
      this.prisma.mouvement.findMany({
        where: {
          entrepriseId,
          produitId: produit.id,
          createdAt: { gte: debut },
          type: { not: 'TRANSFERT' },
        },
        select: { type: true, quantite: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    let niveau =
      (stock._sum.quantite ?? 0) -
      mouvements.reduce((t, m) => t + effet(m.type, m.quantite), 0);
    let index = 0;
    const semaines = Array.from({ length: NB_SEMAINES }, (_, i) => {
      const debutSemaine = debut.getTime() + i * 7 * JOUR_MS;
      const finSemaine = debutSemaine + 7 * JOUR_MS;
      const ouverture = niveau;
      let haut = niveau;
      let bas = niveau;
      while (
        index < mouvements.length &&
        mouvements[index].createdAt.getTime() < finSemaine
      ) {
        niveau += effet(mouvements[index].type, mouvements[index].quantite);
        haut = Math.max(haut, niveau);
        bas = Math.min(bas, niveau);
        index += 1;
      }
      return {
        debut: new Date(debutSemaine).toISOString(),
        ouverture,
        haut,
        bas,
        cloture: niveau,
      };
    });

    const produits = suggestions.some((s) => s.id === produit.id)
      ? suggestions
      : [{ id: produit.id, nom: produit.nom }, ...suggestions];
    return { produit, produits, semaines };
  }
}
