import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2, { message: "Le nom de l'entreprise doit contenir au moins 2 caractères." })
  @MaxLength(100)
  nomEntreprise!: string;

  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  @MaxLength(100)
  nomAdmin!: string;

  @IsEmail({}, { message: 'Adresse email invalide.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
  @MaxLength(72) // limite technique d'argon2/bcrypt sur la longueur d'entrée
  password!: string;
}
