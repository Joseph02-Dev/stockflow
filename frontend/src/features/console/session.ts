import { useSyncExternalStore } from 'react';

export interface Operateur {
  id: string;
  email: string;
  nom: string;
}

export interface SessionConsole {
  accessToken: string;
  operateur: Operateur;
}

/**
 * Clé distincte de celle de l'application cliente (stockflow.session) :
 * une session opérateur et une session client coexistent sans se marcher
 * dessus. Stockée en sessionStorage, volontairement : une session
 * privilégiée ne doit pas survivre à la fermeture de l'onglet.
 */
const CLE = 'stockflow.console-session';

const abonnes = new Set<() => void>();
let cacheBrut: string | null = null;
let cacheSession: SessionConsole | null = null;

function lireBrut(): string | null {
  try {
    return sessionStorage.getItem(CLE);
  } catch {
    return null;
  }
}

export function getSessionConsole(): SessionConsole | null {
  const brut = lireBrut();
  if (brut === cacheBrut) return cacheSession;
  cacheBrut = brut;
  try {
    cacheSession = brut ? (JSON.parse(brut) as SessionConsole) : null;
  } catch {
    cacheSession = null;
    sessionStorage.removeItem(CLE);
  }
  return cacheSession;
}

function notifier() {
  for (const abonne of abonnes) abonne();
}

export function setSessionConsole(session: SessionConsole) {
  sessionStorage.setItem(CLE, JSON.stringify(session));
  notifier();
}

export function clearSessionConsole() {
  sessionStorage.removeItem(CLE);
  notifier();
}

function souscrire(abonne: () => void) {
  abonnes.add(abonne);
  return () => abonnes.delete(abonne);
}

export function useSessionConsole(): SessionConsole | null {
  return useSyncExternalStore(souscrire, getSessionConsole, () => null);
}

/**
 * Début et fin de validité du token opérateur (champs iat et exp du JWT,
 * en ms), pour afficher le temps de session restant. Lecture seule de la
 * charge utile : la signature reste vérifiée par le serveur à chaque requête.
 */
export function periodeSessionConsole(session: SessionConsole): { debut: number; fin: number } | null {
  try {
    const charge = session.accessToken.split('.')[1];
    const json = atob(charge.replace(/-/g, '+').replace(/_/g, '/'));
    const { iat, exp } = JSON.parse(json) as { iat?: unknown; exp?: unknown };
    return typeof iat === 'number' && typeof exp === 'number' ? { debut: iat * 1000, fin: exp * 1000 } : null;
  } catch {
    return null;
  }
}
