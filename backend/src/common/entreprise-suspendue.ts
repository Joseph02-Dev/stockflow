import { ForbiddenException } from '@nestjs/common';

/** Code machine joint au 403, pour que le frontend déconnecte proprement. */
export const CODE_ENTREPRISE_SUSPENDUE = 'ENTREPRISE_SUSPENDUE';

export const MESSAGE_ENTREPRISE_SUSPENDUE =
  "L'accès de votre entreprise a été suspendu. Contactez votre administrateur.";

/** 403 unique, partagé par la connexion et le garde des requêtes authentifiées. */
export function erreurEntrepriseSuspendue(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    error: 'Forbidden',
    code: CODE_ENTREPRISE_SUSPENDUE,
    message: MESSAGE_ENTREPRISE_SUSPENDUE,
  });
}
