import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';

/**
 * Synchronisation incrémentale vers la base locale de l'appareil
 * (docs/adr/0001-application-web-local-first.md, ticket SYNC-02).
 *
 * Chaque appel renvoie, par table, les lignes modifiées depuis le curseur
 * (colonne updated_at, tenue par la base : SYNC-01), par pages. Le curseur
 * est opaque pour l'appareil : il le renvoie tel quel à l'appel suivant.
 */

export const TABLES_SYNCHRONISEES = [
  'produits',
  'stock',
  'emplacements',
  'categories',
  'marques',
  'clients',
  'fournisseurs',
  'alertes',
  'lots',
  'ventes',
  'mouvements',
  'commandes',
] as const;
export type TableSynchronisee = (typeof TABLES_SYNCHRONISEES)[number];

/**
 * Position de lecture d'une table : date de modification puis clé de la
 * dernière ligne lue (identifiant, ou produit et emplacement pour le stock).
 * L'ordre (updated_at, clé) est total : aucune ligne sautée ni lue deux
 * fois au sein d'une même lecture, même à date égale.
 */
type Position = [string, ...string[]];
type Curseur = Partial<Record<TableSynchronisee, Position>>;

/** Lignes par table et par appel ; au-delà, l'appareil rappelle aussitôt (encore = true). */
export const TAILLE_PAGE = 500;
/** Ventes et mouvements recopiés sur l'appareil : historique récent seulement. */
export const HISTORIQUE_JOURS = 90;
/**
 * Recul du curseur une fois à jour : une écriture est datée du début de sa
 * transaction mais visible seulement à sa validation. Relire les dernières
 * minutes à chaque appel ne coûte presque rien et ne laisse rien passer
 * (requêtes bornées à 30 s, transactions inactives à 60 s).
 */
const MARGE_MS_DEFAUT = 2 * 60_000;
const TAILLE_CURSEUR_MAX = 4000;

export interface ReponseSynchronisation {
  curseur: string;
  /** Une table au moins a rempli sa page : rappeler aussitôt avec le nouveau curseur. */
  encore: boolean;
  tables: Record<TableSynchronisee, unknown[]>;
  /**
   * Identifiants encore existants des tables où l'on supprime vraiment
   * (les autres archivent, et la modification passe par updated_at).
   */
  existants: { categories: string[]; marques: string[] };
  /**
   * Associations fournisseur ↔ produit, au complet à chaque appel (petite
   * table, sans date de modification) : l'appareil remplace les siennes.
   */
  associations: { fournisseursProduits: { fournisseurId: string; produitId: string }[] };
}

function lireCurseur(brut: string | undefined): Curseur {
  if (!brut) return {};
  try {
    if (brut.length > TAILLE_CURSEUR_MAX) throw new Error('trop long');
    const lu: unknown = JSON.parse(Buffer.from(brut, 'base64url').toString('utf8'));
    if (typeof lu !== 'object' || lu === null || Array.isArray(lu)) throw new Error('forme');
    const curseur: Curseur = {};
    for (const [table, position] of Object.entries(lu)) {
      if (!(TABLES_SYNCHRONISEES as readonly string[]).includes(table)) throw new Error('table');
      if (
        !Array.isArray(position) ||
        position.length < 2 ||
        !position.every((p) => typeof p === 'string') ||
        Number.isNaN(Date.parse(position[0]))
      ) {
        throw new Error('position');
      }
      curseur[table as TableSynchronisee] = position as Position;
    }
    return curseur;
  } catch {
    throw new BadRequestException('Curseur de synchronisation invalide : recommencez une synchronisation complète.');
  }
}

function ecrireCurseur(curseur: Curseur): string {
  return Buffer.from(JSON.stringify(curseur), 'utf8').toString('base64url');
}

/** Lignes après la position (updated_at, id). */
function apres(position: Position | undefined) {
  if (!position) return {};
  const date = new Date(position[0]);
  return { OR: [{ updatedAt: { gt: date } }, { updatedAt: date, id: { gt: position[1] } }] };
}

const ORDRE = [{ updatedAt: 'asc' as const }, { id: 'asc' as const }];

@Injectable()
export class SynchronisationService {
  private readonly margeMs: number;

  constructor(private readonly prisma: PrismaService) {
    // Réglable (SYNC_MARGE_MS) : 0 dans les tests d'incrément.
    const marge = Number(process.env.SYNC_MARGE_MS);
    this.margeMs = Number.isInteger(marge) && marge >= 0 ? marge : MARGE_MS_DEFAUT;
  }

  async synchroniser(entrepriseId: string, curseurBrut?: string): Promise<ReponseSynchronisation> {
    const curseur = lireCurseur(curseurBrut);
    const maintenant = Date.now();
    const debutHistorique = new Date(maintenant - HISTORIQUE_JOURS * 86_400_000);
    const plancher: Position = [new Date(maintenant - this.margeMs).toISOString(), ''];
    const page = { orderBy: ORDRE, take: TAILLE_PAGE };
    const pourEntreprise = (table: TableSynchronisee) => ({ entrepriseId, ...apres(curseur[table]) });

    const p = this.prisma;
    const position = curseur.stock;
    const [produits, stock, emplacements, categories, marques, clients, fournisseurs, alertes, lots, ventes, mouvements, commandes] =
      await Promise.all([
        p.produit.findMany({ where: pourEntreprise('produits'), ...page }),
        p.stock.findMany({
          where: {
            produit: { entrepriseId },
            ...(position && {
              OR: [
                { updatedAt: { gt: new Date(position[0]) } },
                { updatedAt: new Date(position[0]), produitId: { gt: position[1] } },
                { updatedAt: new Date(position[0]), produitId: position[1], emplacementId: { gt: position[2] ?? '' } },
              ],
            }),
          },
          orderBy: [{ updatedAt: 'asc' }, { produitId: 'asc' }, { emplacementId: 'asc' }],
          take: TAILLE_PAGE,
        }),
        p.emplacement.findMany({ where: pourEntreprise('emplacements'), ...page }),
        p.categorie.findMany({ where: pourEntreprise('categories'), ...page }),
        p.marque.findMany({ where: pourEntreprise('marques'), ...page }),
        p.client.findMany({ where: pourEntreprise('clients'), ...page }),
        p.fournisseur.findMany({ where: pourEntreprise('fournisseurs'), ...page }),
        p.alerte.findMany({ where: pourEntreprise('alertes'), ...page }),
        p.lot.findMany({ where: pourEntreprise('lots'), ...page }),
        p.vente.findMany({
          where: { ...pourEntreprise('ventes'), createdAt: { gte: debutHistorique } },
          // Règlements : ce qui est payé et reste dû (un nouveau règlement renvoie la vente).
          include: { lignes: true, reglements: { select: { id: true, montant: true, mode: true, createdAt: true } } },
          ...page,
        }),
        p.mouvement.findMany({ where: { ...pourEntreprise('mouvements'), createdAt: { gte: debutHistorique } }, ...page }),
        // Commandes : toutes (peu nombreuses), avec lignes et auteur (nom seul).
        p.commandeFournisseur.findMany({
          where: pourEntreprise('commandes'),
          include: {
            lignes: { select: { id: true, produitId: true, quantiteCommandee: true } },
            utilisateur: { select: { id: true, nom: true } },
          },
          ...page,
        }),
      ]);

    const tables: Record<TableSynchronisee, { updatedAt: Date }[]> = {
      produits,
      stock,
      emplacements,
      categories,
      marques,
      clients,
      fournisseurs,
      alertes,
      lots,
      ventes,
      mouvements,
      commandes,
    };
    const suivant: Curseur = {};
    let encore = false;
    for (const table of TABLES_SYNCHRONISEES) {
      const lignes = tables[table];
      const derniere = lignes.at(-1);
      if (lignes.length === TAILLE_PAGE && derniere) {
        // Page pleine : on reprend juste après la dernière ligne lue.
        encore = true;
        const ligne = derniere as unknown as { id?: string; produitId?: string; emplacementId?: string };
        const cle = table === 'stock' ? [ligne.produitId ?? '', ligne.emplacementId ?? ''] : [ligne.id ?? ''];
        suivant[table] = [derniere.updatedAt.toISOString(), ...cle];
      } else {
        // À jour : reprise un peu avant maintenant (voir MARGE_MS_DEFAUT).
        suivant[table] = plancher;
      }
    }

    const [idsCategories, idsMarques, fournisseursProduits] = await Promise.all([
      p.categorie.findMany({ where: { entrepriseId }, select: { id: true } }),
      p.marque.findMany({ where: { entrepriseId }, select: { id: true } }),
      p.fournisseurProduit.findMany({
        where: { fournisseur: { entrepriseId } },
        select: { fournisseurId: true, produitId: true },
      }),
    ]);

    return {
      curseur: ecrireCurseur(suivant),
      encore,
      tables,
      existants: { categories: idsCategories.map((c) => c.id), marques: idsMarques.map((m) => m.id) },
      associations: { fournisseursProduits },
    };
  }
}
