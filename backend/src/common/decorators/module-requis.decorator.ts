import { SetMetadata } from '@nestjs/common';

export type ModuleOptionnel = 'inventaires' | 'transferts';

export const MODULE_REQUIS_KEY = 'moduleRequis';

/**
 * Marque une route (ou un controller entier) comme appartenant à un module
 * activable par entreprise depuis la console. EntrepriseActiveGuard
 * refuse alors la requête (403, code MODULE_DESACTIVE) si le module est
 * désactivé — masquer l'interface ne suffit pas.
 */
export const ModuleRequis = (module: ModuleOptionnel) => SetMetadata(MODULE_REQUIS_KEY, module);
