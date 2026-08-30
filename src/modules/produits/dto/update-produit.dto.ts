import { IsInt, IsOptional, IsString, Min, MaxLength, MinLength } from 'class-validator';

export class UpdateProduitDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Le nom du produit est requis.' })
  @MaxLength(150)
  nom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsInt({ message: 'Le seuil doit être un nombre entier.' })
  @Min(0, { message: 'Le seuil ne peut pas être négatif.' })
  seuilAlerte?: number;
}
