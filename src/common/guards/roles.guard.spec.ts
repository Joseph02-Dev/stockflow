import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, vi } from 'vitest';
import { RolesGuard } from './roles.guard.js';
import type { RequestContext } from '../context/tenant-context.service.js';

function buildContext(options: {
  tenantContext?: RequestContext;
  isPublic?: boolean;
  roles?: RequestContext['role'][];
}): { context: ExecutionContext; reflector: Reflector } {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
    if (key === 'isPublic') return options.isPublic;
    if (key === 'roles') return options.roles;
    return undefined;
  });

  const request = { tenantContext: options.tenantContext };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

describe('RolesGuard', () => {
  it('autorise une route @Public() sans contexte authentifié', () => {
    const { context, reflector } = buildContext({ isPublic: true });
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejette avec 401 une route protégée sans contexte authentifié', () => {
    const { context, reflector } = buildContext({ isPublic: false });
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("autorise une route protégée sans @Roles() dès qu'un utilisateur est authentifié, quel que soit son rôle", () => {
    const { context, reflector } = buildContext({
      tenantContext: { entrepriseId: 'ent-1', utilisateurId: 'user-1', role: 'GESTIONNAIRE' },
    });
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejette avec 403 un utilisateur authentifié dont le rôle ne correspond pas à @Roles()', () => {
    const { context, reflector } = buildContext({
      tenantContext: { entrepriseId: 'ent-1', utilisateurId: 'user-1', role: 'GESTIONNAIRE' },
      roles: ['ADMIN'],
    });
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('autorise un utilisateur authentifié dont le rôle correspond à @Roles()', () => {
    const { context, reflector } = buildContext({
      tenantContext: { entrepriseId: 'ent-1', utilisateurId: 'user-1', role: 'ADMIN' },
      roles: ['ADMIN'],
    });
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
  });
});
