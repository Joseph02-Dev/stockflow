import * as Sentry from '@sentry/react';
import type { Breadcrumb, ErrorEvent } from '@sentry/react';
import { getSession } from './session';

/**
 * Remontée des erreurs du navigateur vers Sentry (projet « stockflow-web »).
 * Le DSN vient de la variable Vercel VSENTRY_DSN, injectée au build ; sans
 * elle, rien n'est initialisé.
 *
 * Données : jamais de cookies, d'en-têtes, de corps, de saisies ni de
 * jetons. Les liens d'invitation, de vérification d'e-mail et de
 * réinitialisation portent un jeton dans l'URL (?token=) : masqué partout.
 */
const PARAMETRE_SENSIBLE = /([?&#](?:token|jeton|password|mot_?de_?passe|secret|code)=)[^&#\s]*/gi;

export const masquerJetons = (texte: string) => texte.replace(PARAMETRE_SENSIBLE, '$1[masqué]');

const masquer = (valeur: unknown) => (typeof valeur === 'string' ? masquerJetons(valeur) : valeur);

export function nettoyerEvenement(evenement: ErrorEvent): ErrorEvent {
  if (evenement.request) evenement.request = { url: masquer(evenement.request.url) as string | undefined };
  // Identifiants seulement, lus au moment de l'erreur : jamais l'e-mail, le
  // nom ni les jetons de la session.
  const session = getSession();
  evenement.user = session ? { id: session.utilisateur.id } : undefined;
  if (session) evenement.tags = { ...evenement.tags, entrepriseId: session.entreprise.id };
  return evenement;
}

export function nettoyerFilAriane(miette: Breadcrumb): Breadcrumb | null {
  // Saisies et contenu de la console : jamais transmis.
  if (miette.category === 'ui.input' || miette.category === 'console') return null;
  if (miette.data) {
    miette.data = Object.fromEntries(Object.entries(miette.data).map(([cle, valeur]) => [cle, masquer(valeur)]));
  }
  if (miette.message) miette.message = masquerJetons(miette.message);
  return miette;
}

export function initialiserSurveillance(dsn: string = __SENTRY_DSN__): boolean {
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    beforeSend: nettoyerEvenement,
    beforeBreadcrumb: nettoyerFilAriane,
  });
  return true;
}

/** Erreurs React non rattrapées (createRoot, React 19). */
export const gestionnaireErreursReact = Sentry.reactErrorHandler();
