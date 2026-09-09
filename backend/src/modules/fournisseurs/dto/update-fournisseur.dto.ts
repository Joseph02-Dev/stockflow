import { IsEmail, IsInt, IsOptional, IsString, IsUrl, Min, MaxLength, MinLength } from 'class-validator';

export class UpdateFournisseurDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Le nom du fournisseur est requis.' })
  @MaxLength(150)
  nom?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Adresse email invalide.' })
  emailContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telephone?: string;

  @IsOptional()
  @IsUrl({}, { message: 'photoUrl doit être une URL valide.' })
  photoUrl?: string;

  @IsOptional()
  @IsInt({ message: 'Le délai de livraison doit être un nombre entier de jours.' })
  @Min(0, { message: 'Le délai de livraison ne peut pas être négatif.' })
  delaiLivraisonJours?: number;
}
