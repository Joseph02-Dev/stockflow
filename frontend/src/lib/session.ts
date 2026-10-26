import { effacerBasesLocales } from './baseLocale';

export interface Utilisateur {
  id: string;
  email: string;
  nom: string;
  role: 'ADMIN' | 'GESTIONNAIRE';
  photoUrl?: string | null;
}

export interface Entreprise {
  id: string;
  nom: string;
}

/**
 * Ce que le navigateur garde de la session : qui est connecté, pour quelle
 * entreprise. Aucun jeton : le refresh token vit dans un cookie httpOnly
 * posé par l'API (illisible par un script), l'access token seulement en
 * mémoire, le temps de l'onglet.
 */
export interface Session {
  utilisateur: Utilisateur;
  entreprise: Entreprise;
}

/** Réponse de connexion ou de renouvellement : la session et son access token. */
export interface ReponseSession extends Session {
  accessToken: string;
}

/** Format enregistré avant le cookie httpOnly : jetons dans le stockage. */
interface SessionHeritee extends Session {
  accessToken?: string;
  refreshToken?: string;
}

const CLE_SESSION = 'stockflow.session';
/** Cache des réponses de l'API dans le service worker (public/sw.js, même nom). */
const CACHE_DONNEES = 'stockflow-v1';
/** Date du dernier préchargement hors ligne (lib/prechargementHorsLigne.ts, même clé). */
const CLE_DERNIER_PRECHARGEMENT = 'stockflow.dernier-prechargement';

const abonnes = new Set<() => void>();

// Cache de la session parsée. Indispensable : useSyncExternalStore exige
// qu'un snapshot inchangé retourne la MÊME référence, sinon React boucle
// indéfiniment sur les rendus.
let cacheBrut: string | null = null;
let cacheSession: Session | null = null;

/** Access token de l'onglet : jamais écrit dans le stockage. Perdu au rechargement, renouvelé par le cookie. */
let jetonAcces: string | null = null;

/**
 * Refresh token d'une session ouverte avant le cookie httpOnly : échangé une
 * fois contre le cookie (lib/api.ts), puis oublié. Lu en mémoire seulement,
 * il a déjà été effacé du stockage.
 */
let refreshHerite: string | null = null;

/**
 * "Rester connectée" (case à cocher de l'écran de connexion) détermine
 * RÉELLEMENT où la session est stockée, pas seulement visuellement :
 * - cochée (par défaut) → localStorage, survit à la fermeture du
 *   navigateur, comme avant.
 * - décochée → sessionStorage, effacée à la fermeture de l'onglet ou du
 *   navigateur — utile sur un poste partagé.
 * getSession() vérifie les deux emplacements, au cas où l'un contiendrait
 * une session d'une précédente visite avec l'autre choix.
 */
function lireBrut(): string | null {
  return localStorage.getItem(CLE_SESSION) ?? sessionStorage.getItem(CLE_SESSION);
}

export function getSession(): Session | null {
  const brut = lireBrut();
  if (brut === cacheBrut) return cacheSession;

  cacheBrut = brut;
  if (!brut) {
    cacheSession = null;
    return null;
  }
  try {
    const lue = JSON.parse(brut) as SessionHeritee;
    if (lue.accessToken || lue.refreshToken) {
      // Ancien format : les jetons quittent le stockage dès cette lecture.
      jetonAcces ??= lue.accessToken ?? null;
      refreshHerite ??= lue.refreshToken ?? null;
      const session: Session = { utilisateur: lue.utilisateur, entreprise: lue.entreprise };
      const nettoye = JSON.stringify(session);
      (localStorage.getItem(CLE_SESSION) !== null ? localStorage : sessionStorage).setItem(CLE_SESSION, nettoye);
      cacheBrut = nettoye;
      cacheSession = session;
    } else {
      cacheSession = lue;
    }
  } catch {
    // Session corrompue : on la purge plutôt que de laisser
    // l'application dans un état incohérent.
    localStorage.removeItem(CLE_SESSION);
    sessionStorage.removeItem(CLE_SESSION);
    cacheBrut = null;
    cacheSession = null;
  }
  return cacheSession;
}

export function getAccessToken(): string | null {
  return jetonAcces;
}

/** Refresh token de l'ancien format, à présenter une seule fois à /auth/refresh. */
export function refreshTokenHerite(): string | null {
  getSession();
  return refreshHerite;
}

export function oublierRefreshTokenHerite(): void {
  refreshHerite = null;
}

/**
 * Indique si la session actuelle est stockée dans localStorage (donc
 * "Rester connectée" était coché) — utilisé par les écrans qui mettent à
 * jour une session déjà ouverte (profil, entreprise, rôle) pour ne pas
 * forcer silencieusement un retour à localStorage si la personne avait
 * choisi sessionStorage.
 */
export function sessionActuelleEstPersistante(): boolean {
  return localStorage.getItem(CLE_SESSION) !== null;
}

/**
 * Enregistre la session (sans jeton) ; l'access token d'une réponse de
 * connexion ou de renouvellement reste en mémoire.
 */
export function setSession(session: Session | ReponseSession, resterConnecte = true): void {
  if ('accessToken' in session && session.accessToken) jetonAcces = session.accessToken;
  const stockee: Session = { utilisateur: session.utilisateur, entreprise: session.entreprise };
  const serialise = JSON.stringify(stockee);
  if (resterConnecte) {
    localStorage.setItem(CLE_SESSION, serialise);
    sessionStorage.removeItem(CLE_SESSION);
  } else {
    sessionStorage.setItem(CLE_SESSION, serialise);
    localStorage.removeItem(CLE_SESSION);
  }
  abonnes.forEach((notifier) => notifier());
}

export function clearSession(): void {
  jetonAcces = null;
  refreshHerite = null;
  localStorage.removeItem(CLE_SESSION);
  sessionStorage.removeItem(CLE_SESSION);
  abonnes.forEach((notifier) => notifier());

  // Le cache du service worker ne distingue pas les utilisateurs (les
  // réponses API sont mises en cache par URL, sans tenir compte du token
  // qui les a produites). Sans ce nettoyage, un second compte connecté
  // sur le même appareil pourrait voir les données hors-ligne du premier.
  // Seules les données partent : l'application elle-même (cache
  // « stockflow-appli », public/sw.js) reste, pour s'ouvrir hors ligne.
  // Le repère du dernier préchargement part avec elles : la prochaine
  // connexion précharge aussitôt (lib/prechargementHorsLigne.ts).
  if ('caches' in window) {
    void caches.delete(CACHE_DONNEES);
  }
  localStorage.removeItem(CLE_DERNIER_PRECHARGEMENT);
  // Même règle pour la base locale de l'appareil (lib/baseLocale.ts).
  void effacerBasesLocales();
}

/** Permet aux composants React de réagir aux changements de session. */
export function souscrireSession(callback: () => void): () => void {
  abonnes.add(callback);
  return () => abonnes.delete(callback);
}
