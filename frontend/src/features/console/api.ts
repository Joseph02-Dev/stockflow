import axios from 'axios';
import type { AxiosError } from 'axios';
import { clearSessionConsole, getSessionConsole } from './session';

/**
 * Client HTTP de la console, distinct de celui de l'application : il ne
 * porte que le token opérateur, jamais le token client — et l'inverse
 * est vrai pour l'instance de src/lib/api.ts.
 */
export const apiConsole = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api' });

apiConsole.interceptors.request.use((config) => {
  const session = getSessionConsole();
  if (session) config.headers.Authorization = `Bearer ${session.accessToken}`;
  return config;
});

apiConsole.interceptors.response.use(
  (reponse) => reponse,
  (erreur: AxiosError) => {
    // Session expirée (2 h) ou opérateur supprimé : retour à la connexion.
    if (erreur.response?.status === 401) clearSessionConsole();
    return Promise.reject(erreur);
  },
);
