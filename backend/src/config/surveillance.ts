import type { ErrorEvent, NodeOptions } from '@sentry/nestjs';
import { urlJournalisee } from './journalisation.js';

/**
 * Remontée des erreurs inattendues vers Sentry (projet « stockflow-api »).
 * Facultatif : sans SENTRY_DSN (ou en test), le SDK n'est pas initialisé
 * et rien ne change.
 *
 * Données : jamais d'en-têtes (Authorization, cookies), de corps, d'IP ni
 * de paramètres d'URL sensibles. Seuls les identifiants d'entreprise,
 * d'utilisateur et de requête sont joints (FiltreErreursInattendues).
 */
export const COLLECTE_MINIMALE = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} satisfies NonNullable<NodeOptions['dataCollection']>;

export function optionsSentry(env: NodeJS.ProcessEnv = process.env): NodeOptions | null {
  if (!env.SENTRY_DSN || env.NODE_ENV === 'test') return null;
  return {
    dsn: env.SENTRY_DSN,
    environment: env.RAILWAY_ENVIRONMENT_NAME ?? env.NODE_ENV ?? 'development',
    release: env.RAILWAY_GIT_COMMIT_SHA,
    // Les défauts du SDK (v11) collectent en-têtes, cookies, corps, valeurs
    // des variables locales et infos utilisateur : tout est coupé.
    dataCollection: COLLECTE_MINIMALE,
    beforeSend: nettoyerEvenement,
  };
}

export function nettoyerEvenement(evenement: ErrorEvent): ErrorEvent {
  if (evenement.request) {
    evenement.request = { method: evenement.request.method, url: urlJournalisee(evenement.request.url) };
  }
  if (evenement.user) evenement.user = { id: evenement.user.id };
  return evenement;
}
