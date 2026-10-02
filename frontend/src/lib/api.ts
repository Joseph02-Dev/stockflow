import axios from 'axios';
import type { AxiosError } from 'axios';
import { getAccessToken, clearSession } from './session';

// En développement local, /api est redirigé vers le backend par le proxy
// Vite (voir vite.config.ts) — ce proxy n'existe pas une fois le site
// construit et hébergé. En production, VITE_API_URL doit pointer vers
// l'URL publique complète du backend déployé.
const baseURL = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Un 401 signifie que la session n'est plus valide : on la purge pour
    // que l'application redirige vers la page de connexion.
    if (error.response?.status === 401) {
      clearSession();
    }
    // Un 429 (limitation de débit) n'invalide pas la session : on la
    // conserve et on remplace le corps par le message neutre, pour que
    // l'écran affiche une consigne claire même si un intermédiaire a
    // répondu sans corps exploitable.
    if (estTropDeRequetes(error) && error.response) {
      error.response.data = { statusCode: 429, message: MESSAGE_TROP_DE_REQUETES };
    }
    // Entreprise suspendue par la console : la session est inutilisable,
    // on la purge et on renvoie vers la connexion, qui explique pourquoi.
    // Pas de redirection depuis la connexion elle-même (elle affiche déjà
    // le message renvoyé par le serveur).
    const corps = error.response?.data as { code?: string } | undefined;
    if (error.response?.status === 403 && corps?.code === 'ENTREPRISE_SUSPENDUE') {
      clearSession();
      if (window.location.pathname !== '/connexion') {
        window.location.replace('/connexion?suspendue=1');
      }
    }
    return Promise.reject(error);
  },
);

/** Message affiché quand le serveur limite le débit (HTTP 429). */
export const MESSAGE_TROP_DE_REQUETES = 'Trop de requêtes. Réessayez dans quelques minutes.';

/** Vrai si l'erreur est un refus pour excès de requêtes (HTTP 429). */
export function estTropDeRequetes(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 429;
}

/**
 * Extrait un message lisible depuis une erreur Axios.
 * Le backend renvoie soit une chaîne, soit un tableau de messages de
 * validation (class-validator) — les deux cas sont gérés ici pour ne
 * jamais afficher "[object Object]" à l'utilisateur.
 */
export function messageErreur(error: unknown, fallback = 'Une erreur est survenue.'): string {
  if (estTropDeRequetes(error)) return MESSAGE_TROP_DE_REQUETES;
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(' ');
    if (typeof data?.message === 'string') return data.message;
  }
  return fallback;
}
