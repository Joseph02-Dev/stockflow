import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestContext } from '../context/tenant-context.service.js';

/**
 * Injecte l'utilisateur authentifié courant (id, entreprise, rôle) dans un
 * paramètre de méthode de controller. Usage :
 * `create(@CurrentUser() user: RequestContext) { ... }`
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestContext => {
  const request = ctx.switchToHttp().getRequest<Request & { tenantContext?: RequestContext }>();
  const user = request.tenantContext;

  if (!user) {
    throw new UnauthorizedException('Aucun utilisateur authentifié pour cette requête.');
  }

  return user;
});
