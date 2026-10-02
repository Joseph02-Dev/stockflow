import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';

/** Jeton d'injection du JwtService propre à la console. */
export const CONSOLE_JWT = Symbol('CONSOLE_JWT');

/** Valeur du claim `typ` de tout token opérateur. */
export const TYPE_TOKEN_CONSOLE = 'console';

export interface PayloadConsole {
  sub: string; // operateur_id
  typ: typeof TYPE_TOKEN_CONSOLE;
}

/**
 * Le secret console doit exister et différer de celui de l'application
 * cliente. Sinon la console reste fermée (fail closed) plutôt que de
 * risquer qu'un token client soit accepté ici, ou l'inverse.
 */
export function secretConsoleUtilisable(): boolean {
  const secret = process.env.JWT_CONSOLE_SECRET;
  return !!secret && secret !== process.env.JWT_ACCESS_SECRET && secret !== process.env.JWT_REFRESH_SECRET;
}

/**
 * JwtService dédié, signé avec JWT_CONSOLE_SECRET. Volontairement distinct
 * du JwtService global (JWT_ACCESS_SECRET) : aucun code de la console ne
 * doit pouvoir signer ni vérifier un token client, et inversement.
 */
export const consoleJwtProvider = {
  provide: CONSOLE_JWT,
  useFactory: () =>
    new JwtService({
      // Secret aléatoire impossible à deviner si la variable manque : les
      // vérifications échouent toutes, la console reste fermée.
      secret: secretConsoleUtilisable()
        ? process.env.JWT_CONSOLE_SECRET
        : `console-fermee-${crypto.randomUUID()}`,
      signOptions: { expiresIn: (process.env.JWT_CONSOLE_EXPIRATION ?? '2h') as StringValue },
    }),
};
