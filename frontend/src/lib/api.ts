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
    return Promise.reject(error);
  },
);

/**
 * Extrait un message lisible depuis une erreur Axios.
 * Le backend renvoie soit une chaîne, soit un tableau de messages de
 * validation (class-validator) — les deux cas sont gérés ici pour ne
 * jamais afficher "[object Object]" à l'utilisateur.
 */
export function messageErreur(error: unknown, fallback = 'Une erreur est survenue.'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(' ');
    if (typeof data?.message === 'string') return data.message;
  }
  return fallback;
}
