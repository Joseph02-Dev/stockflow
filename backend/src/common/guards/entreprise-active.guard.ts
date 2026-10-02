import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../config/prisma.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { MODULE_REQUIS_KEY } from '../decorators/module-requis.decorator.js';
import type { ModuleOptionnel } from '../decorators/module-requis.decorator.js';
import { IS_CONSOLE_KEY } from '../../modules/console/securite/console.metadata.js';
import { erreurEntrepriseSuspendue } from '../entreprise-suspendue.js';
import type { RequestContext } from '../context/tenant-context.service.js';

const LIBELLES_MODULES: Record<ModuleOptionnel, string> = {
  inventaires: 'Les inventaires',
  transferts: 'Les transferts entre emplacements',
};

/**
 * Coupe immédiatement l'accès d'une entreprise suspendue par la console,
 * et refuse les routes d'un module désactivé pour cette entreprise.
 *
 * Appliqué globalement, après RolesGuard : pour toute requête authentifiée
 * de l'application cliente, relit le statut de l'entreprise en base. Sans
 * cette vérification, un utilisateur déjà connecté continuerait d'utiliser
 * l'application jusqu'à l'expiration de son access token (15 min).
 *
 * Coût : une lecture par clé primaire par requête authentifiée — le prix
 * d'une suspension réellement immédiate.
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

    const entreprise = await this.prisma.entreprise.findUnique({
      where: { id: contexte.entrepriseId },
      select: { statut: true, moduleInventaires: true, moduleTransferts: true },
    });
    if (entreprise?.statut === 'SUSPENDUE') {
      throw erreurEntrepriseSuspendue();
    }

    // Même lecture que le statut : les modules ne coûtent aucune requête de plus.
    const moduleRequis = this.reflector.getAllAndOverride<ModuleOptionnel | undefined>(MODULE_REQUIS_KEY, cibles);
    const actif = { inventaires: entreprise?.moduleInventaires, transferts: entreprise?.moduleTransferts };
    if (moduleRequis && entreprise && !actif[moduleRequis]) {
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
