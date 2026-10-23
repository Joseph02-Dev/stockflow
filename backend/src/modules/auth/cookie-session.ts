import type { CookieOptions, Request, Response } from 'express';
import ms from 'ms';
import type { StringValue } from 'ms';
import type { AuthResult } from './auth.service.js';

/**
 * Le refresh token voyage dans un cookie httpOnly, jamais dans le corps des
 * réponses : un script de la page (XSS) ne peut ni le lire ni l'envoyer
 * ailleurs. L'access token, de courte durée, reste dans le corps et n'est
 * gardé qu'en mémoire par le navigateur.
 *
 * - Path /auth : le cookie n'accompagne que /auth/refresh et /auth/logout,
 *   pas chaque appel d'API.
 * - SameSite Strict : stockflowgn.com et api.stockflowgn.com sont le même
 *   « site », le cookie part ; aucun autre site ne peut le faire envoyer
 *   (pas de CSRF sur le renouvellement).
 * - Secure : HTTPS seulement (localhost est accepté par les navigateurs).
 */
export const COOKIE_SESSION = 'stockflow_refresh';

function dureeRefreshMs(): number {
  return ms((process.env.JWT_REFRESH_EXPIRATION ?? '7d') as StringValue);
}

function options(): CookieOptions {
  return { httpOnly: true, secure: true, sameSite: 'strict', path: '/auth' };
}

/**
 * Pose le cookie et retire le refresh token du corps. « Rester connecté »
 * décoché : cookie de session, effacé à la fermeture du navigateur.
 */
export function repondreAvecSession(
  res: Response,
  resultat: AuthResult,
  persistant = true,
): Omit<AuthResult, 'refreshToken'> {
  const { refreshToken, ...corps } = resultat;
  res.cookie(
    COOKIE_SESSION,
    refreshToken,
    persistant ? { ...options(), maxAge: dureeRefreshMs() } : options(),
  );
  return corps;
}

export function effacerCookieSession(res: Response): void {
  res.clearCookie(COOKIE_SESSION, options());
}

/** Valeur du cookie de session, sans dépendance à cookie-parser. */
export function lireCookieSession(req: Request): string | undefined {
  for (const morceau of req.headers.cookie?.split(';') ?? []) {
    const separateur = morceau.indexOf('=');
    if (
      separateur > 0 &&
      morceau.slice(0, separateur).trim() === COOKIE_SESSION
    ) {
      const valeur = morceau.slice(separateur + 1).trim();
      try {
        return decodeURIComponent(valeur) || undefined;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
