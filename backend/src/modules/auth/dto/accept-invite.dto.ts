import { IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @IsString()
  @MinLength(1, { message: "Le jeton d'invitation est requis." })
  token!: string;

  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères.' })
  @MaxLength(100)
  nom!: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
  @MaxLength(72)
  password!: string;
}
