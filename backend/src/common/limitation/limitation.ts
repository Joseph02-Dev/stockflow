import { applyDecorators } from '@nestjs/common';
import { hours, minutes, Throttle } from '@nestjs/throttler';

/**
 * Limitation de débit par IP (@nestjs/throttler).
 *
 * Un seul limiteur nommé « global » : 120 requêtes par minute et par IP sur
 * toute l'API — volontairement large, l'application est légitimement
 * bavarde (tableau de bord, listes, filtres). Les routes sensibles le
 * remplacent par une limite stricte via @LimiteStricte(), avec un compteur
 * propre à chaque route.
 */
export const LIMITEUR = 'global';
export const LIMITE_GLOBALE = { limit: 120, ttl: minutes(1) };

/** Message neutre : ni compteur restant, ni indice sur l'existence d'un compte. */
export const MESSAGE_TROP_DE_REQUETES = 'Trop de requêtes. Réessayez dans quelques minutes.';

/**
 * Jeton d'injection : la limitation est-elle active ? Faux sous Vitest
 * (NODE_ENV === 'test'), où plusieurs suites enchaînent connexions et
 * créations de comptes depuis la même IP. Le test dédié au 429 la réactive
 * en surchargeant ce fournisseur, sans baisser aucune limite.
 */
export const LIMITATION_ACTIVE = Symbol('LIMITATION_ACTIVE');

/** Limites strictes des routes sensibles, par IP. */
export const LIMITES_STRICTES = {
  connexion: { limit: 8, ttl: minutes(15) },
  inscription: { limit: 5, ttl: hours(1) },
  motDePasseOublie: { limit: 4, ttl: hours(1) },
  renvoiVerification: { limit: 4, ttl: hours(1) },
  reinitialisation: { limit: 10, ttl: hours(1) },
  acceptationInvitation: { limit: 10, ttl: hours(1) },
  connexionConsole: { limit: 5, ttl: minutes(15) },
  televersement: { limit: 30, ttl: minutes(10) },
} as const;

export const LimiteStricte = (limite: { limit: number; ttl: number }) =>
  applyDecorators(Throttle({ [LIMITEUR]: limite }));
