import { api } from './api';

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
/** Situations client préchargées (dette et plafond, affichés à la vente). */
const SITUATIONS_CLIENT_MAX = 100;

export interface ContextePrechargement {
  admin: boolean;
  lots: boolean;
  rangement: boolean;
}

/**
 * Seulement ce que la base de l'appareil ne sait pas reconstituer (calculs
 * du serveur, historiques au-delà de la base) : emplacements, stock,
 * produits, clients, fournisseurs, alertes, commandes et ventes sont lus
 * localement hors ligne (lib/lectureLocale.ts, ADR 0001, SYNC-08).
 */
function adressesFixes({ admin, lots, rangement }: ContextePrechargement): string[] {
  return [
    // Tableau de bord et barre du haut
    '/entreprise',
    '/notifications',
    '/dashboard/overview',
    '/dashboard/indicateurs',
    '/mouvements?limite=7',
    ...(lots ? ['/peremptions'] : []),
    // Ventes
    '/statistiques?periode=7j',
    '/creances',
    // Stock et catalogue
    '/mouvements?limite=50',
    '/categories',
    '/marques',
    // Approvisionnement, pertes
    '/retours-fournisseur',
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

    // Adresses qui dépendent des données : situation des clients (dette et
    // plafond, à la vente) et fiche des commandes à réceptionner.
    const [clients, commandes] = await Promise.all([
      api.get<{ id: string; archive?: boolean }[]>('/clients?').then((r) => r.data, () => []),
      api.get<{ id: string; statut: string }[]>('/commandes').then((r) => r.data, () => []),
    ]);
    await chargerParLots([
      // Commandes envoyées : leur fiche, pour les réceptionner hors ligne.
      ...commandes.filter((c) => c.statut === 'ENVOYEE').map((c) => `/commandes/${c.id}`),
      ...clients
        .filter((c) => !c.archive)
        .slice(0, SITUATIONS_CLIENT_MAX)
        .map((c) => `/clients/${c.id}/situation`),
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
