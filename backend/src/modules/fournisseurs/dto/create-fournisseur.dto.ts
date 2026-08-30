import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFournisseurDto {
  @IsString()
  @MinLength(1, { message: 'Le nom du fournisseur est requis.' })
  @MaxLength(150)
  nom!: string;

  @IsOptional()
  @IsEmail({}, { message: 'Adresse email invalide.' })
  emailContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telephone?: string;
}
