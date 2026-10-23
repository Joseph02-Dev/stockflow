import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Adresse email invalide.' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Le mot de passe est requis.' })
  password!: string;

  /** « Rester connecté » décoché : cookie de session, effacé à la fermeture du navigateur. */
  @IsOptional()
  @IsBoolean()
  resterConnecte?: boolean;
}
