import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../config/prisma.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { MODULE_REQUIS_KEY } from '../decorators/module-requis.decorator.js';
import type { ModuleOptionnel } from '../decorators/module-requis.decorator.js';
import { IS_CONSOLE_KEY } from '../../modules/console/securite/console.metadata.js';
import { erreurEntrepriseSuspendue } from '../entreprise-suspendue.js';
import { erreurCompteDesactive } from '../compte-desactive.js';
import type { RequestContext } from '../context/tenant-context.service.js';

const LIBELLES_MODULES: Record<ModuleOptionnel, string> = {
  inventaires: 'Les inventaires',
  transferts: 'Les transferts entre emplacements',
};

/**
 * Garde de session : relit en base, à chaque requête authentifiée de
 * l'application cliente, l'état réel de l'utilisateur et de son entreprise.
 *
 * - Compte désactivé par un administrateur → 403 COMPTE_DESACTIVE.
 * - Utilisateur introuvable ou rattaché à une autre entreprise que celle du
 *   token → 401 (le token ne correspond plus à aucune réalité).
 * - Entreprise suspendue par la console → 403 ENTREPRISE_SUSPENDUE.
 * - Rôle : celui de la base remplace celui du token. Un administrateur
 *   rétrogradé perd ses droits immédiatement, pas à l'expiration du token.
 * - Module désactivé pour l'entreprise → 403 MODULE_DESACTIVE.
 *
 * Appliqué globalement, AVANT RolesGuard (qui décide donc sur le rôle à
 * jour). Coût : une lecture par clé primaire avec jointure, la même
 * qu'auparavant pour la seule entreprise.
 */
@Injectable()
export class EntrepriseActiveGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const cibles = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, cibles) ||
      this.reflector.getAllAndOverride<boolean>(IS_CONSOLE_KEY, cibles)
    ) {
      return true;
    }

    const contexte = context.switchToHttp().getRequest<Request & { tenantContext?: RequestContext }>().tenantContext;
    // Sans contexte, RolesGuard a déjà refusé la requête (401).
    if (!contexte) return true;

    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: contexte.utilisateurId },
      select: {
        entrepriseId: true,
        role: true,
        desactiveAt: true,
        entreprise: { select: { statut: true, moduleInventaires: true, moduleTransferts: true } },
      },
    });
    if (!utilisateur || utilisateur.entrepriseId !== contexte.entrepriseId) {
      throw new UnauthorizedException('Session invalide : reconnectez-vous.');
    }
    if (utilisateur.desactiveAt) throw erreurCompteDesactive();
    const { entreprise } = utilisateur;
    if (entreprise.statut === 'SUSPENDUE') {
      throw erreurEntrepriseSuspendue();
    }
    // Le contexte est partagé avec AsyncLocalStorage (même objet) : la
    // correction du rôle vaut pour toute la suite de la requête.
    contexte.role = utilisateur.role;

    // Même lecture que le statut : les modules ne coûtent aucune requête de plus.
    const moduleRequis = this.reflector.getAllAndOverride<ModuleOptionnel | undefined>(MODULE_REQUIS_KEY, cibles);
    const actif = { inventaires: entreprise.moduleInventaires, transferts: entreprise.moduleTransferts };
    if (moduleRequis && !actif[moduleRequis]) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'MODULE_DESACTIVE',
        message: `${LIBELLES_MODULES[moduleRequis]} ne sont pas activés pour votre entreprise. Contactez StockFlow.`,
      });
    }
    return true;
  }
}
