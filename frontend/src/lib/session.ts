export interface Utilisateur {
  id: string;
  email: string;
  nom: string;
  role: 'ADMIN' | 'GESTIONNAIRE';
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

export function getSession(): Session | null {
  const brut = localStorage.getItem(CLE_SESSION);
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
    cacheBrut = null;
    cacheSession = null;
  }
  return cacheSession;
}

export function getAccessToken(): string | null {
  return getSession()?.accessToken ?? null;
}

export function setSession(session: Session): void {
  localStorage.setItem(CLE_SESSION, JSON.stringify(session));
  abonnes.forEach((notifier) => notifier());
}

export function clearSession(): void {
  localStorage.removeItem(CLE_SESSION);
  abonnes.forEach((notifier) => notifier());
}

/** Permet aux composants React de réagir aux changements de session. */
export function souscrireSession(callback: () => void): () => void {
  abonnes.add(callback);
  return () => abonnes.delete(callback);
}
