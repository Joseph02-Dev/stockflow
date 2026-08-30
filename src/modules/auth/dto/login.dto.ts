import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Adresse email invalide.' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Le mot de passe est requis.' })
  password!: string;
}
