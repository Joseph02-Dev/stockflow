import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import type { RequestContext } from '../context/tenant-context.service.js';

type RequeteHttp = { id?: unknown; method?: string; route?: { path?: string }; tenantContext?: RequestContext };

/**
 * Envoie à Sentry les erreurs inattendues (bug, base indisponible…), avec
 * l'entreprise, l'utilisateur et l'identifiant de requête (X-Request-Id)
 * pour retrouver la ligne correspondante dans les journaux. Les
 * HttpException (404, 403, 409…) sont des réponses voulues : ignorées.
 * La réponse au client reste celle de Nest (500 sans détail).
 *
 * Contexte posé par capture (withScope) et non par requête : sûr même sans
 * isolation automatique des requêtes par le SDK.
 */
@Catch()
export class FiltreErreursInattendues extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (!(exception instanceof HttpException) && host.getType() === 'http') {
      const requete = host.switchToHttp().getRequest<RequeteHttp>();
      Sentry.withScope((scope) => {
        const contexte = requete.tenantContext;
        if (contexte) {
          scope.setTag('entrepriseId', contexte.entrepriseId);
          scope.setUser({ id: contexte.utilisateurId });
        }
        if (requete.id) scope.setTag('requestId', String(requete.id));
        if (requete.route?.path) scope.setTag('route', `${requete.method} ${requete.route.path}`);
        Sentry.captureException(exception);
      });
    }
    super.catch(exception, host);
  }
}
