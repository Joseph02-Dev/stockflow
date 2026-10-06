import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FONCTIONNALITE_KEY } from '../decorators/fonctionnalite.decorator.js';
import { fonctionnalitesSuspendues, type Fonctionnalite } from '../../config/fonctionnalites.js';

const LIBELLES: Record<Fonctionnalite, string> = {
  import: 'L’import de catalogue',
  rapports: 'La génération de rapports',
  uploads: 'L’envoi d’images',
};

/**
 * Interrupteurs globaux (config/fonctionnalites.ts). Placé avant tout
 * accès à la base : une fonctionnalité coupée ne coûte rien.
 */
@Injectable()
export class FonctionnaliteGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const nom = this.reflector.getAllAndOverride<Fonctionnalite | undefined>(FONCTIONNALITE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (nom && fonctionnalitesSuspendues().includes(nom)) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: 'FONCTIONNALITE_SUSPENDUE',
        message: `${LIBELLES[nom]} est momentanément indisponible. Réessayez plus tard.`,
      });
    }
    return true;
  }
}
