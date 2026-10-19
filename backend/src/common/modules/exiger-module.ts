import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import { MODULES_ENTREPRISE, SELECTION_MODULES, modulesActifs, type ModuleOptionnel } from './modules-entreprise.js';

/** 403 MODULE_DESACTIVE, avec la marche à suivre selon qui règle le module. */
export function erreurModuleDesactive(module: ModuleOptionnel) {
  const { nom, reglePar } = MODULES_ENTREPRISE[module];
  return new ForbiddenException({
    statusCode: 403,
    error: 'Forbidden',
    code: 'MODULE_DESACTIVE',
    message:
      reglePar === 'console'
        ? `Le module « ${nom} » n’est pas activé pour votre entreprise. Contactez NimbaFlow.`
        : `Le module « ${nom} » est désactivé : un administrateur peut l’activer dans Paramètres.`,
  });
}

/**
 * Pour une donnée (et non une route) propre à un module : un champ comme
 * suiviParLot ou parentId, accepté seulement si le module est actif.
 */
export async function exigerModule(prisma: PrismaService, entrepriseId: string, module: ModuleOptionnel) {
  const entreprise = await prisma.entreprise.findUniqueOrThrow({
    where: { id: entrepriseId },
    select: SELECTION_MODULES,
  });
  if (!modulesActifs(entreprise)[module]) throw erreurModuleDesactive(module);
}
