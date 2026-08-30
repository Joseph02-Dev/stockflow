import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Injecte l'entreprise_id de l'utilisateur authentifié directement dans un
 * paramètre de méthode de controller.
 *
 * Usage : `findAll(@CurrentTenant() entrepriseId: string) { ... }`
 *
 * Lit `req.tenantContext`, déposé par TenantContextMiddleware — jamais un
 * champ envoyé par le client. Lève une erreur explicite si la route est
 * utilisée sans authentification valide, plutôt que de laisser passer un
 * `undefined` qui pourrait involontairement désactiver le filtre tenant
 * dans une requête Prisma.
 */
export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request & { tenantContext?: { entrepriseId: string } }>();
  const entrepriseId = request.tenantContext?.entrepriseId;

  if (!entrepriseId) {
    throw new UnauthorizedException('Aucun contexte entreprise disponible pour cette requête.');
  }

  return entrepriseId;
});
