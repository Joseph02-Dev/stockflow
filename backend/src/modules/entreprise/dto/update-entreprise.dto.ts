import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateEntrepriseDto {
  @IsString()
  @MinLength(2, { message: "Le nom de l'entreprise doit contenir au moins 2 caractères." })
  @MaxLength(100)
  nom!: string;
}
