import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { stdTimeFunctions, type DestinationStream } from 'pino';
import type { Params } from 'nestjs-pino';
import type { RequestContext } from '../common/context/tenant-context.service.js';

/** Identifiant reçu d'un proxy accepté seulement s'il est court et inoffensif. */
const IDENTIFIANT_VALIDE = /^[A-Za-z0-9._-]{8,128}$/;
/** Paramètres d'URL dont la valeur ne doit jamais apparaître dans un journal. */
const PARAMETRE_SENSIBLE = /token|jeton|password|mot_?de_?passe|secret|code/i;

/**
 * Identifiant de requête : repris de X-Request-Id s'il est valide (corrélation
 * avec le proxy), sinon généré ; renvoyé dans la réponse pour qu'un client
 * puisse le citer au support.
 */
export function identifiantRequete(req: IncomingMessage, res: ServerResponse): string {
  const recu = req.headers['x-request-id'];
  const id = typeof recu === 'string' && IDENTIFIANT_VALIDE.test(recu) ? recu : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

/** URL journalisée : valeurs des paramètres sensibles remplacées. */
export function urlJournalisee(url: string | undefined): string {
  if (!url) return '';
  const debutRequete = url.indexOf('?');
  if (debutRequete < 0) return url;
  const parametres = new URLSearchParams(url.slice(debutRequete + 1));
  for (const nom of new Set(parametres.keys())) {
    if (PARAMETRE_SENSIBLE.test(nom)) parametres.set(nom, '[masqué]');
  }
  return `${url.slice(0, debutRequete)}?${parametres.toString()}`;
}

/**
 * Journaux JSON (pino) lisibles par Railway : `level` en toutes lettres,
 * `message` pour le texte, le reste en attributs filtrables.
 * Par requête : identifiant, méthode, URL, statut, durée, entreprise et
 * utilisateur. Jamais d'en-têtes (Authorization, cookies), de corps ni d'IP.
 */
export function optionsJournalisation(env: NodeJS.ProcessEnv = process.env, destination?: DestinationStream): Params {
  const options = {
    level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
    messageKey: 'message',
    timestamp: stdTimeFunctions.isoTime,
    formatters: { level: (niveau: string) => ({ level: niveau }) },
    genReqId: identifiantRequete,
    // Appelé aussi en fin de requête : le contexte posé par
    // TenantContextMiddleware est alors disponible.
    customProps: (req: IncomingMessage) => {
      const contexte = (req as IncomingMessage & { tenantContext?: RequestContext }).tenantContext;
      return contexte ? { entrepriseId: contexte.entrepriseId, utilisateurId: contexte.utilisateurId } : {};
    },
    customLogLevel: (_req: IncomingMessage, res: ServerResponse, erreur?: Error) =>
      erreur || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    // Le healthcheck Railway interroge /health en boucle : pas de bruit.
    autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
    serializers: {
      req: (req: IncomingMessage & { id?: string }) => ({ id: req.id, method: req.method, url: urlJournalisee(req.url) }),
      res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
    },
  };
  return { pinoHttp: destination ? [options, destination] : options };
}
