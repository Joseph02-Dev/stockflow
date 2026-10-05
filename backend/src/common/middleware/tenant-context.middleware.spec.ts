import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { describe, it, expect, beforeEach } from 'vitest';
import { TenantContextMiddleware } from './tenant-context.middleware.js';
import { TenantContextService } from '../context/tenant-context.service.js';

function buildRequest(authorizationHeader?: string) {
  return { headers: authorizationHeader ? { authorization: authorizationHeader } : {} } as any;
}

describe('TenantContextMiddleware', () => {
  const secret = 'test-secret-uniquement-pour-ce-test';
  let jwtService: JwtService;
  let tenantContext: TenantContextService;
  let middleware: TenantContextMiddleware;

  beforeEach(() => {
    jwtService = new JwtService({ secret });
    tenantContext = new TenantContextService();
    middleware = new TenantContextMiddleware(jwtService, tenantContext);
  });

  it("laisse passer la requête sans contexte quand aucun header Authorization n'est présent", () => {
    const req = buildRequest();
    let nextCalled = false;

    middleware.use(req, {} as any, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.tenantContext).toBeUndefined();
  });

  it("rejette avec 401 un header Authorization mal formé (pas de schéma Bearer)", () => {
    const req = buildRequest('token-sans-bearer');

    expect(() => middleware.use(req, {} as any, () => {})).toThrow(UnauthorizedException);
  });

  it('rejette avec 401 un token invalide', () => {
    const req = buildRequest('Bearer token-invalide-et-mal-signe');

    expect(() => middleware.use(req, {} as any, () => {})).toThrow(UnauthorizedException);
  });

  it('rejette avec 401 un token valide mais signé avec un autre secret', () => {
    const otherJwtService = new JwtService({ secret: 'un-autre-secret' });
    const token = otherJwtService.sign({ sub: 'user-1', entrepriseId: 'ent-1', role: 'ADMIN' });
    const req = buildRequest(`Bearer ${token}`);

    expect(() => middleware.use(req, {} as any, () => {})).toThrow(UnauthorizedException);
  });

  it('accepte un token valide et dépose le contexte (entreprise, utilisateur, rôle)', () => {
    const token = jwtService.sign({ sub: 'user-1', entrepriseId: 'ent-1', role: 'GESTIONNAIRE' }, { expiresIn: '15m' });
    const req = buildRequest(`Bearer ${token}`);
    let contextPendantLaRequete: unknown;

    middleware.use(req, {} as any, () => {
      // Vérifie que le contexte est bien accessible PENDANT le traitement
      // de la requête, via le service (AsyncLocalStorage), pas seulement
      // attaché à req.
      contextPendantLaRequete = tenantContext.getContext();
    });

    expect(contextPendantLaRequete).toEqual({
      entrepriseId: 'ent-1',
      utilisateurId: 'user-1',
      role: 'GESTIONNAIRE',
    });
    expect(req.tenantContext).toEqual({
      entrepriseId: 'ent-1',
      utilisateurId: 'user-1',
      role: 'GESTIONNAIRE',
    });
  });

  it('rejette un token valide mais dont le payload est incomplet', () => {
    // Token signé correctement mais sans entrepriseId — ne doit jamais
    // être accepté silencieusement (règle de sécurité multi-tenant).
    const token = jwtService.sign({ sub: 'user-1' });
    const req = buildRequest(`Bearer ${token}`);

    expect(() => middleware.use(req, {} as any, () => {})).toThrow(UnauthorizedException);
  });

  describe('un jeton de renouvellement ne vaut jamais jeton d’accès', () => {
    const payload = { sub: 'user-1', entrepriseId: 'ent-1', role: 'ADMIN' as const };

    it('rejette un jeton marqué « refresh », même signé avec le secret d’accès', () => {
      const token = jwtService.sign({ ...payload, typ: 'refresh' }, { expiresIn: '15m' });
      expect(() => middleware.use(buildRequest(`Bearer ${token}`), {} as any, () => {})).toThrow(UnauthorizedException);
    });

    it('rejette un ancien jeton de renouvellement sans « typ » (7 jours, signé avec le secret d’accès)', () => {
      const token = jwtService.sign(payload, { expiresIn: '7d' });
      expect(() => middleware.use(buildRequest(`Bearer ${token}`), {} as any, () => {})).toThrow(UnauthorizedException);
    });

    it('rejette un jeton sans expiration', () => {
      const token = jwtService.sign(payload);
      expect(() => middleware.use(buildRequest(`Bearer ${token}`), {} as any, () => {})).toThrow(UnauthorizedException);
    });

    it('accepte un jeton d’accès de 15 minutes, avec ou sans « typ » (jetons déjà émis)', () => {
      for (const extra of [{ typ: 'access' }, {}]) {
        const token = jwtService.sign({ ...payload, ...extra }, { expiresIn: '15m' });
        const req = buildRequest(`Bearer ${token}`);
        let suite = false;
        middleware.use(req, {} as any, () => (suite = true));
        expect(suite).toBe(true);
        expect(req.tenantContext).toMatchObject({ entrepriseId: 'ent-1', utilisateurId: 'user-1' });
      }
    });
  });
});
