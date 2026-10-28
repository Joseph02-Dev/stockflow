import { IsJWT, Matches } from 'class-validator';

/** Seconde étape de la connexion opérateur : le code de l'application d'authentification. */
export class CodeConsoleDto {
  @IsJWT()
  jetonEtape!: string;

  @Matches(/^\d{6}$/, { message: 'Le code comporte 6 chiffres.' })
  code!: string;
}
