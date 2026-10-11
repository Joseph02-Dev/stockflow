import { SetMetadata } from '@nestjs/common';
import type { ModuleOptionnel } from '../modules/modules-entreprise.js';

export type { ModuleOptionnel };

export const MODULE_REQUIS_KEY = 'moduleRequis';

/**
 * Marque une route (ou un controller entier) comme appartenant à un module
 * activable par entreprise (voir MODULES_ENTREPRISE). EntrepriseActiveGuard
 * refuse alors la requête (403, code MODULE_DESACTIVE) si le module est
 * désactivé — masquer l'interface ne suffit pas.
 */
export const ModuleRequis = (module: ModuleOptionnel) => SetMetadata(MODULE_REQUIS_KEY, module);
