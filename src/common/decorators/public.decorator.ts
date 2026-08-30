import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marque une route comme publique — aucune authentification requise.
 * Réservé aux routes comme /auth/login, /auth/register.
 *
 * Usage : `@Public() @Post('login') login() { ... }`
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
