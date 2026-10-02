import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../config/prisma.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { IS_CONSOLE_KEY } from '../../modules/console/securite/console.metadata.js';
import { erreurEntrepriseSuspendue } from '../entreprise-suspendue.js';
import type { RequestContext } from '../context/tenant-context.service.js';

/**
 * Coupe immédiatement l'accès d'une entreprise suspendue par la console.
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
      select: { statut: true },
    });
    if (entreprise?.statut === 'SUSPENDUE') {
      throw erreurEntrepriseSuspendue();
    }
    return true;
  }
}
