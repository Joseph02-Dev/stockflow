import type { BaseLocale } from './baseLocale';

/**
 * Moteur de synchronisation de la base locale (docs/adr/0001, ticket
 * SYNC-04) : lit GET /sync page après page et applique chaque réponse à la
 * base de l'appareil. Sans dépendance au réseau ni à React : la lecture
 * d'une page est fournie par l'appelant (useSynchronisationLocale.ts).
 */

/** Réponse de GET /sync (backend, SynchronisationService). */
export interface ReponseSync {
  curseur: string;
  encore: boolean;
  tables: Record<string, Record<string, unknown>[]>;
  existants: { categories: string[]; marques: string[] };
}

/** Lecture d'une page ; `curseur` absent : instantané complet. */
export type LirePage = (curseur: string | null) => Promise<ReponseSync>;

/** Le serveur a refusé le curseur (400) : l'appareil repart d'un instantané complet. */
export class CurseurRefuse extends Error {}

/** Garde-fou : jamais plus de pages par synchronisation (500 lignes par table et par page). */
const PAGES_MAX = 200;
/** Ventes et mouvements gardés sur l'appareil, comme côté serveur (HISTORIQUE_JOURS). */
const HISTORIQUE_JOURS = 90;

const TABLES = [
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
] as const;

/** Applique une page : lignes enregistrées par clé (une ligne revenue remplace l'ancienne), suppressions, curseur. */
export async function appliquerPage(base: BaseLocale, reponse: ReponseSync, maintenant = new Date()): Promise<void> {
  await base.transaction('rw', base.tables, async () => {
    for (const nom of TABLES) {
      const lignes = reponse.tables[nom];
      if (lignes?.length) await base.table(nom).bulkPut(lignes);
    }
    await base.categories.where('id').noneOf(reponse.existants.categories).delete();
    await base.marques.where('id').noneOf(reponse.existants.marques).delete();
    const precedent = await base.etat.get('synchronisation');
    await base.etat.put({
      cle: 'synchronisation',
      curseur: reponse.curseur,
      // Réussie seulement quand la dernière page est appliquée.
      derniereReussite: reponse.encore ? (precedent?.derniereReussite ?? null) : maintenant.toISOString(),
    });
  });
}

/** Oublie tout ce qui a été recopié (curseur refusé, changement de format). */
async function viderBase(base: BaseLocale): Promise<void> {
  await base.transaction('rw', base.tables, () => Promise.all(base.tables.map((table) => table.clear())));
}

/**
 * Synchronise la base jusqu'à être à jour. Renvoie la date de réussite.
 * Une erreur de lecture (réseau, serveur) remonte telle quelle : la base
 * garde ce qui a déjà été appliqué, et la prochaine synchronisation
 * reprend au dernier curseur enregistré.
 */
export async function synchroniserBase(base: BaseLocale, lirePage: LirePage, maintenant = () => new Date()): Promise<string> {
  let repriseComplete = false;
  for (let page = 0; page < PAGES_MAX; page++) {
    const curseur = (await base.etat.get('synchronisation'))?.curseur ?? null;
    let reponse: ReponseSync;
    try {
      reponse = await lirePage(curseur);
    } catch (erreur) {
      if (erreur instanceof CurseurRefuse && curseur && !repriseComplete) {
        repriseComplete = true;
        await viderBase(base);
        continue;
      }
      throw erreur;
    }
    const instant = maintenant();
    await appliquerPage(base, reponse, instant);
    if (!reponse.encore) {
      await oublierHistoriqueAncien(base, instant);
      return instant.toISOString();
    }
  }
  throw new Error('Synchronisation interrompue : trop de pages.');
}

/** Le serveur n'envoie plus les ventes et mouvements de plus de 90 jours : l'appareil les oublie aussi. */
async function oublierHistoriqueAncien(base: BaseLocale, maintenant: Date): Promise<void> {
  const limite = new Date(maintenant.getTime() - HISTORIQUE_JOURS * 86_400_000).toISOString();
  await base.ventes.where('createdAt').below(limite).delete();
  await base.mouvements.where('createdAt').below(limite).delete();
}
