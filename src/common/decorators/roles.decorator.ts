import { SetMetadata } from '@nestjs/common';
import type { RequestContext } from '../context/tenant-context.service.js';

export const ROLES_KEY = 'roles';

/**
 * Restreint une route à un ou plusieurs rôles.
 *
 * Usage : `@Roles('ADMIN') @Post() create() { ... }`
 *
 * Sans ce décorateur, une route protégée (non @Public()) exige simplement
 * une authentification valide, quel que soit le rôle.
 */
export const Roles = (...roles: RequestContext['role'][]) => SetMetadata(ROLES_KEY, roles);
