import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { RequestContext } from '../context/tenant-context.service.js';

/**
 * TECH-004 — Guard de rôles.
 *
 * Appliqué globalement (voir app.module.ts). Pour chaque route :
 * 1. Si @Public() → accès autorisé sans vérification.
 * 2. Sinon, exige un contexte authentifié valide (déposé par
 *    TenantContextMiddleware, TECH-003) → 401 si absent.
 * 3. Si @Roles(...) est présent sur la route, exige que le rôle de
 *    l'utilisateur en fasse partie → 403 sinon.
 *
 * Ce guard ne réalise aucune vérification métier propre au multi-tenant
 * (isolation par entreprise) — c'est la responsabilité de chaque service,
 * qui doit systématiquement filtrer ses requêtes Prisma avec
 * @CurrentTenant(). Ce guard répond uniquement à la question
 * "cet utilisateur a-t-il le droit d'appeler cette route ?".
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { tenantContext?: RequestContext }>();
    const user = request.tenantContext;

    if (!user) {
      throw new UnauthorizedException('Authentification requise pour accéder à cette ressource.');
    }

    const requiredRoles = this.reflector.getAllAndOverride<RequestContext['role'][]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException("Vous n'avez pas le rôle requis pour effectuer cette action.");
    }

    return true;
  }
}
