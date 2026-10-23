import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class RefreshDto {
  /**
   * Transition seulement : sessions ouvertes avant le cookie httpOnly, dont
   * le navigateur détient encore le refresh token. Le cookie l'emporte
   * toujours. À retirer une fois ces sessions expirées (7 jours).
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  refreshToken?: string;

  /** « Rester connecté » : cookie persistant (par défaut) ou de session. */
  @IsOptional()
  @IsBoolean()
  resterConnecte?: boolean;
}
