import { ForbiddenException } from '@nestjs/common';

/** Code machine joint au 403, pour que le frontend déconnecte proprement. */
export const CODE_COMPTE_DESACTIVE = 'COMPTE_DESACTIVE';

export const MESSAGE_COMPTE_DESACTIVE = 'Votre accès a été retiré par un administrateur de votre entreprise.';

/** 403 unique, partagé par la connexion, le renouvellement de session et le garde. */
export function erreurCompteDesactive(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    error: 'Forbidden',
    code: CODE_COMPTE_DESACTIVE,
    message: MESSAGE_COMPTE_DESACTIVE,
  });
}
