import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import ms from 'ms';
import type { StringValue } from 'ms';
import type { NextFunction, Request, Response } from 'express';
import { TenantContextService, type RequestContext } from '../context/tenant-context.service.js';

/**
 * Payload attendu à l'intérieur d'un access token JWT StockFlow.
 * Émis par le module Auth lors de la connexion (AUTH-002, ticket suivant).
 */
interface JwtPayload {
  sub: string; // utilisateur_id
  entrepriseId: string;
  role: 'ADMIN' | 'GESTIONNAIRE';
  typ?: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

/** Tolérance d'horloge ajoutée à la durée de vie maximale d'un jeton d'accès. */
const MARGE_SECONDES = 60;

/** Durée de vie maximale d'un jeton d'accès, en secondes (JWT_ACCESS_EXPIRATION, 15 min par défaut). */
function dureeMaxAcces(): number {
  const duree = ms((process.env.JWT_ACCESS_EXPIRATION ?? '15m') as StringValue);
  return Math.ceil((Number.isFinite(duree) ? duree : 15 * 60_000) / 1000) + MARGE_SECONDES;
}

/**
 * TECH-003 — Middleware d'extraction et de filtrage entreprise_id.
 *
 * Règle de sécurité centrale (voir architecture validée, section Sécurité) :
 * entreprise_id n'est JAMAIS lu depuis une donnée envoyée par le client
 * (body, query, params, headers custom) — uniquement depuis le JWT signé
 * par le serveur, décodé ici.
 *
 * Comportement :
 * - Pas de header Authorization → aucune action, la requête continue sans
 *   contexte. Charge à un guard ultérieur (TECH-004) de refuser l'accès
 *   aux routes qui exigent une authentification.
 * - Header Authorization présent mais token invalide/expiré → 401 immédiat.
 *   Un token présent mais invalide est toujours une erreur, indépendamment
 *   de la route visée.
 * - Token valide → le contexte (entreprise, utilisateur, rôle) est déposé
 *   dans TenantContextService pour toute la durée de la requête.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly tenantContext: TenantContextService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      next();
      return;
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('En-tête Authorization mal formé, attendu "Bearer <token>".');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré.');
    }

    if (!payload.entrepriseId || !payload.sub || !payload.role) {
      throw new UnauthorizedException('Token valide mais incomplet.');
    }
    // Un jeton de renouvellement ne vaut jamais jeton d'accès. Les anciens
    // jetons (sans « typ ») sont reconnus à leur durée de vie : signés avec
    // le secret d'accès quand JWT_REFRESH_SECRET manquait, ils auraient
    // sinon ouvert l'API pendant 7 jours, hors de toute révocation.
    if (
      payload.typ === 'refresh' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      payload.exp - payload.iat > dureeMaxAcces()
    ) {
      throw new UnauthorizedException('Token invalide ou expiré.');
    }

    // Un seul objet, partagé par AsyncLocalStorage et `req` : le garde de
    // session peut y corriger le rôle (relu en base) pour toute la requête.
    const contexte: RequestContext = { entrepriseId: payload.entrepriseId, utilisateurId: payload.sub, role: payload.role };
    this.tenantContext.run(contexte, () => {
      // Attaché également à `req` pour un accès simple et synchrone via
      // le décorateur @CurrentTenant()/@CurrentUser() dans les controllers.
      (req as Request & { tenantContext: RequestContext }).tenantContext = contexte;
      next();
    });
  }
}
