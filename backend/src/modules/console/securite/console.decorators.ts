import { applyDecorators, createParamDecorator, SetMetadata, UseGuards } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ConsoleGuard } from './console.guard.js';
import { IS_CONSOLE_KEY, IS_CONSOLE_PUBLIQUE_KEY } from './console.metadata.js';


export interface OperateurConnecte {
  id: string;
  email: string;
  nom: string;
}

export type RequeteConsole = Request & { operateur?: OperateurConnecte };

/**
 * Marque un controller comme appartenant à la console opérateur : le
 * contrôle d'accès client (RolesGuard, contexte tenant) ne s'y applique
 * pas, et ConsoleGuard prend le relais. Ne jamais combiner avec
 * @CurrentTenant() : la console n'a pas de « tenant courant ».
 */
export const RouteConsole = () => applyDecorators(SetMetadata(IS_CONSOLE_KEY, true), UseGuards(ConsoleGuard));

/** Seule exception dans la console : la route de connexion elle-même. */
export const ConsolePublique = () => SetMetadata(IS_CONSOLE_PUBLIQUE_KEY, true);

/** Injecte l'opérateur authentifié, déposé par ConsoleGuard. */
export const OperateurCourant = createParamDecorator((_data: unknown, ctx: ExecutionContext): OperateurConnecte => {
  const operateur = ctx.switchToHttp().getRequest<RequeteConsole>().operateur;
  if (!operateur) {
    // Ne devrait jamais arriver derrière ConsoleGuard : on échoue
    // bruyamment plutôt que de journaliser une action sans auteur.
    throw new Error('OperateurCourant utilisé sans ConsoleGuard.');
  }
  return operateur;
});
