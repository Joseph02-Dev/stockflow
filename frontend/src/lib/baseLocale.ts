import Dexie, { type Table } from 'dexie';

/**
 * Base locale de l'appareil (docs/adr/0001-application-web-local-first.md,
 * ticket SYNC-03) : copie des données de l'entreprise, tenue à jour par la
 * synchronisation (GET /sync, SYNC-04). Les écrans la liront même sans
 * réseau (SYNC-06).
 *
 * Une base par entreprise (« stockflow-local-<id> ») : un compte d'une autre
 * entreprise connecté sur le même appareil n'y a jamais accès, et toutes
 * sont effacées à la déconnexion (lib/session.ts).
 */

/** Ligne reçue de GET /sync : enregistrée telle quelle, clés et index ci-dessous. */
type Ligne<Cles> = Cles & { updatedAt: string; [champ: string]: unknown };

export type ProduitLocal = Ligne<{ id: string; nom: string; archive: boolean; categorieId: string | null; marqueId: string | null }>;
export type StockLocal = Ligne<{ produitId: string; emplacementId: string; quantite: number }>;
export type EmplacementLocal = Ligne<{ id: string; nom: string; archive: boolean }>;
export type CategorieLocale = Ligne<{ id: string; nom: string }>;
export type MarqueLocale = Ligne<{ id: string; nom: string }>;
export type ClientLocal = Ligne<{ id: string; nom: string; archive: boolean }>;
export type FournisseurLocal = Ligne<{ id: string; nom: string }>;
export type AlerteLocale = Ligne<{ id: string; produitId: string; statut: string }>;
export type LotLocal = Ligne<{ id: string; produitId: string; emplacementId: string }>;
export type VenteLocale = Ligne<{ id: string; createdAt: string; clientId: string | null; emplacementId: string }>;
export type MouvementLocal = Ligne<{ id: string; createdAt: string; produitId: string; emplacementId: string }>;

/** État de la synchronisation : curseur de GET /sync, date du dernier succès. */
export interface EtatSynchronisation {
  cle: 'synchronisation';
  curseur: string | null;
  derniereReussite: string | null;
}

const PREFIXE = 'stockflow-local-';

export class BaseLocale extends Dexie {
  produits!: Table<ProduitLocal, string>;
  stock!: Table<StockLocal, [string, string]>;
  emplacements!: Table<EmplacementLocal, string>;
  categories!: Table<CategorieLocale, string>;
  marques!: Table<MarqueLocale, string>;
  clients!: Table<ClientLocal, string>;
  fournisseurs!: Table<FournisseurLocal, string>;
  alertes!: Table<AlerteLocale, string>;
  lots!: Table<LotLocal, string>;
  ventes!: Table<VenteLocale, string>;
  mouvements!: Table<MouvementLocal, string>;
  etat!: Table<EtatSynchronisation, string>;

  constructor(entrepriseId: string) {
    super(`${PREFIXE}${entrepriseId}`);
    // Clé primaire en tête, puis les index des recherches et filtres des écrans.
    // Toute évolution passe par une nouvelle version (this.version(2)…), jamais
    // par la modification de celle-ci.
    this.version(1).stores({
      produits: 'id, nom, categorieId, marqueId, archive',
      stock: '[produitId+emplacementId], produitId, emplacementId',
      emplacements: 'id',
      categories: 'id',
      marques: 'id',
      clients: 'id, nom, archive',
      fournisseurs: 'id, nom',
      alertes: 'id, produitId, statut',
      lots: 'id, produitId, emplacementId',
      ventes: 'id, createdAt, clientId, emplacementId',
      mouvements: 'id, createdAt, produitId, emplacementId',
      etat: 'cle',
    });
  }
}

let ouverte: BaseLocale | null = null;

/** Base de l'entreprise connectée ; null sans IndexedDB (navigation privée stricte). */
export function baseLocale(entrepriseId: string): BaseLocale | null {
  if (typeof indexedDB === 'undefined') return null;
  if (ouverte?.name !== `${PREFIXE}${entrepriseId}`) {
    ouverte?.close();
    ouverte = new BaseLocale(entrepriseId);
  }
  return ouverte;
}

/**
 * Efface les bases locales de toutes les entreprises de cet appareil
 * (déconnexion). Ne lève jamais : la déconnexion doit aboutir.
 */
export async function effacerBasesLocales(): Promise<void> {
  ouverte?.close();
  ouverte = null;
  try {
    const noms = await Dexie.getDatabaseNames();
    await Promise.all(noms.filter((nom) => nom.startsWith(PREFIXE)).map((nom) => Dexie.delete(nom)));
  } catch {
    // IndexedDB indisponible : rien à effacer.
  }
}
