import { api } from './api';
import { debutPeriode } from './periode';
import { urlPage } from './pagination';

/**
 * Préchargement des écrans pour le mode hors ligne.
 *
 * Le service worker (public/sw.js) garde la dernière réponse de chaque
 * requête GET et la ressert sans réseau — mais seulement pour les écrans
 * déjà ouverts. Ici, l'application demande d'avance les mêmes adresses que
 * les écrans principaux : ils s'ouvrent ensuite hors ligne même jamais
 * visités, avec les données du dernier préchargement.
 *
 * Les adresses doivent être identiques, au caractère près, à celles des
 * écrans (le cache est indexé par l'URL) : à mettre à jour si un écran
 * change sa requête.
 */

const CLE_DERNIER = 'stockflow.dernier-prechargement';
/** Pas plus d'un préchargement par intervalle, sauf demande explicite. */
const INTERVALLE_MIN_MS = 5 * 60_000;
const REQUETES_SIMULTANEES = 4;
/** Fiches fournisseur préchargées (la page ouvre la première automatiquement). */
const FICHES_FOURNISSEUR_MAX = 20;
/** Situations client préchargées (dette et plafond, affichés à la vente). */
const SITUATIONS_CLIENT_MAX = 100;

export interface ContextePrechargement {
  admin: boolean;
  lots: boolean;
  rangement: boolean;
}

function adressesFixes({ admin, lots, rangement }: ContextePrechargement): string[] {
  return [
    // Tableau de bord et barre du haut
    '/entreprise',
    '/notifications',
    '/dashboard/overview',
    '/dashboard/indicateurs',
    '/mouvements?limite=7',
    '/alertes?statut=ACTIVE',
    ...(lots ? ['/peremptions'] : []),
    // Ventes
    '/statistiques?periode=7j',
    '/creances',
    urlPage('/ventes', new URLSearchParams({ du: debutPeriode(7) }), undefined),
    // Stock, produits, alertes
    '/emplacements',
    '/stock',
    '/stock?',
    '/mouvements?limite=50',
    '/produits?',
    '/produits',
    '/categories',
    '/marques',
    // Approvisionnement, clients, pertes
    '/commandes',
    '/fournisseurs',
    '/clients?',
    '/pertes/synthese',
    '/pertes?limite=50',
    // Statistiques
    '/statistiques?periode=30j',
    '/statistiques/stock-hebdo',
    ...(admin && rangement ? ['/rangement/regles'] : []),
  ];
}

async function chargerParLots(adresses: string[]): Promise<number> {
  let reussies = 0;
  for (let i = 0; i < adresses.length; i += REQUETES_SIMULTANEES) {
    const resultats = await Promise.allSettled(adresses.slice(i, i + REQUETES_SIMULTANEES).map((a) => api.get(a)));
    reussies += resultats.filter((r) => r.status === 'fulfilled').length;
  }
  return reussies;
}

/**
 * Le service worker doit contrôler la page, sinon les réponses ne passent
 * pas par lui et ne sont pas gardées. Faux s'il est absent ou trop lent.
 */
async function serviceWorkerPret(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  if (navigator.serviceWorker.controller) return true;
  return Promise.race([
    new Promise<boolean>((resoudre) =>
      navigator.serviceWorker.addEventListener('controllerchange', () => resoudre(true), { once: true }),
    ),
    new Promise<boolean>((resoudre) => setTimeout(() => resoudre(false), 10_000)),
  ]);
}

const abonnes = new Set<() => void>();
let enCours: Promise<void> | null = null;

export function souscrirePrechargement(rappel: () => void): () => void {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

/** Date ISO du dernier préchargement réussi sur cet appareil. */
export function dernierPrechargement(): string | null {
  try {
    return localStorage.getItem(CLE_DERNIER);
  } catch {
    return null;
  }
}

/**
 * Précharge les écrans principaux. `force` ignore l'intervalle minimal
 * (bouton « Synchroniser »). Ne lève jamais : un échec laisse simplement
 * le cache tel qu'il était.
 */
export function prechargerEcrans(contexte: ContextePrechargement, force = false): Promise<void> {
  const dernier = dernierPrechargement();
  if (!force && dernier && Date.now() - new Date(dernier).getTime() < INTERVALLE_MIN_MS) return Promise.resolve();
  enCours ??= (async () => {
    if (!(await serviceWorkerPret())) return;
    const fixes = adressesFixes(contexte);
    const reussies = await chargerParLots(fixes);
    if (reussies === 0) return;

    // Adresses qui dépendent des données : stock par emplacement et
    // situation des clients (nouvelle vente), fiches fournisseur.
    const [emplacements, fournisseurs, clients, commandes] = await Promise.all([
      api.get<{ id: string }[]>('/emplacements').then((r) => r.data, () => []),
      api.get<{ id: string }[]>('/fournisseurs').then((r) => r.data, () => []),
      api.get<{ id: string; archive?: boolean }[]>('/clients?').then((r) => r.data, () => []),
      api.get<{ id: string; statut: string }[]>('/commandes').then((r) => r.data, () => []),
    ]);
    await chargerParLots([
      ...emplacements.map((e) => `/stock?emplacement_id=${e.id}`),
      // Commandes envoyées : leur fiche, pour les réceptionner hors ligne.
      ...commandes.filter((c) => c.statut === 'ENVOYEE').map((c) => `/commandes/${c.id}`),
      ...clients
        .filter((c) => !c.archive)
        .slice(0, SITUATIONS_CLIENT_MAX)
        .map((c) => `/clients/${c.id}/situation`),
      ...fournisseurs
        .slice(0, FICHES_FOURNISSEUR_MAX)
        .flatMap((f) => [`/fournisseurs/${f.id}`, `/fournisseurs/${f.id}/produits`, `/fournisseurs/${f.id}/receptions`]),
    ]);

    try {
      localStorage.setItem(CLE_DERNIER, new Date().toISOString());
    } catch {
      // Sans effet : seul l'affichage de l'heure est perdu.
    }
    abonnes.forEach((rappel) => rappel());
  })().finally(() => {
    enCours = null;
  });
  return enCours;
}
