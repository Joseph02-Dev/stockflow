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

export interface Session {
  accessToken: string;
  refreshToken: string;
  utilisateur: Utilisateur;
  entreprise: Entreprise;
}

const CLE_SESSION = 'stockflow.session';

const abonnes = new Set<() => void>();

// Cache de la session parsée. Indispensable : useSyncExternalStore exige
// qu'un snapshot inchangé retourne la MÊME référence, sinon React boucle
// indéfiniment sur les rendus.
let cacheBrut: string | null = null;
let cacheSession: Session | null = null;

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
    cacheSession = JSON.parse(brut) as Session;
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
  return getSession()?.accessToken ?? null;
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

export function setSession(session: Session, resterConnecte = true): void {
  const serialise = JSON.stringify(session);
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
  localStorage.removeItem(CLE_SESSION);
  sessionStorage.removeItem(CLE_SESSION);
  abonnes.forEach((notifier) => notifier());

  // Le cache du service worker ne distingue pas les utilisateurs (les
  // réponses API sont mises en cache par URL, sans tenir compte du token
  // qui les a produites). Sans ce nettoyage, un second compte connecté
  // sur le même appareil pourrait voir les données hors-ligne du premier.
  if ('caches' in window) {
    caches.keys().then((cles) => cles.forEach((cle) => caches.delete(cle)));
  }
}

/** Permet aux composants React de réagir aux changements de session. */
export function souscrireSession(callback: () => void): () => void {
  abonnes.add(callback);
  return () => abonnes.delete(callback);
}
