import axios from 'axios';
import type { AxiosError } from 'axios';
import { getAccessToken, clearSession } from './session';

export const api = axios.create({ baseURL: '/api' });

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
