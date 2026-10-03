import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, IsUUID, Max, Min, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CreateProduitDto {
  @IsString()
  @MinLength(1, { message: 'Le nom du produit est requis.' })
  @MaxLength(150)
  nom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsInt({ message: 'Le seuil doit être un nombre entier.' })
  @Min(0, { message: 'Le seuil ne peut pas être négatif.' })
  seuilAlerte?: number;

  @IsOptional()
  @IsUrl({}, { message: 'photoUrl doit être une URL valide.' })
  photoUrl?: string;

  // Montants en francs guinéens (GNF) — devise sans subdivision
  // décimale en circulation, donc toujours un entier.
  @IsOptional()
  @IsInt({ message: 'Le prix d’achat doit être un nombre entier.' })
  @Min(0, { message: 'Le prix d’achat ne peut pas être négatif.' })
  prixAchat?: number;

  @IsOptional()
  @IsInt({ message: 'Le prix de vente doit être un nombre entier.' })
  @Min(0, { message: 'Le prix de vente ne peut pas être négatif.' })
  prixVente?: number;

  // Facultatifs : absents, le produit est vendu au prixVente (détail)
  // à toutes les catégories de clients.
  @IsOptional()
  @IsInt({ message: 'Le prix de gros doit être un nombre entier.' })
  @Min(0, { message: 'Le prix de gros ne peut pas être négatif.' })
  prixGros?: number;

  @IsOptional()
  @IsInt({ message: 'Le prix de demi-gros doit être un nombre entier.' })
  @Min(0, { message: 'Le prix de demi-gros ne peut pas être négatif.' })
  prixDemiGros?: number;

  @IsOptional()
  @IsInt({ message: 'Le taux de TVA doit être un nombre entier.' })
  @Min(0, { message: 'Le taux de TVA ne peut pas être négatif.' })
  @Max(100, { message: 'Le taux de TVA ne peut pas dépasser 100%.' })
  tauxTva?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  codeBarre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID('4', { message: 'categorieId doit être un identifiant valide.' })
  categorieId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'marqueId doit être un identifiant valide.' })
  marqueId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  uniteMesure?: string;
  /** Suivi par lot et date de péremption (désactivé par défaut). */
  @IsOptional()
  @IsBoolean({ message: 'suiviParLot doit être vrai ou faux.' })
  suiviParLot?: boolean;

  // Seuil d'alerte de péremption propre au produit, en jours ; null =
  // seuil de l'entreprise.
  @ValidateIf((_, valeur) => valeur !== null && valeur !== undefined)
  @IsInt({ message: 'Le seuil de péremption doit être un nombre entier de jours.' })
  @Min(1, { message: 'Le seuil de péremption doit être d’au moins 1 jour.' })
  @Max(3650, { message: 'Le seuil de péremption ne peut pas dépasser 3 650 jours.' })
  seuilAlertePeremption?: number | null;
}
