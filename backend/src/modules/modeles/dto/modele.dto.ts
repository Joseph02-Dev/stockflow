import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Axe de variation : « Taille » → [S, M, L]. */
export class AttributDto {
  @IsString()
  @MinLength(1, { message: 'Le nom de l’attribut est requis.' })
  @MaxLength(40)
  nom!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Chaque attribut doit avoir au moins une valeur.' })
  @ArrayMaxSize(50, { message: 'Un attribut ne peut pas avoir plus de 50 valeurs.' })
  @IsString({ each: true })
  @MaxLength(40, { each: true, message: 'Une valeur d’attribut dépasse 40 caractères.' })
  valeurs!: string[];
}

export class CreerModeleDto {
  @IsString()
  @MinLength(1, { message: 'Le nom du modèle est requis.' })
  @MaxLength(120)
  nom!: string;

  /** Préfixe des références générées (« TSHIRT » → TSHIRT-ROUGE-M). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  reference?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Indiquez au moins un attribut (Taille, Couleur…).' })
  @ArrayMaxSize(3, { message: 'Trois attributs au maximum par modèle.' })
  @ValidateNested({ each: true })
  @Type(() => AttributDto)
  attributs!: AttributDto[];

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

  @IsOptional()
  @IsInt({ message: 'Le prix d’achat doit être un nombre entier.' })
  @Min(0, { message: 'Le prix d’achat ne peut pas être négatif.' })
  prixAchat?: number;

  @IsOptional()
  @IsInt({ message: 'Le prix de vente doit être un nombre entier.' })
  @Min(0, { message: 'Le prix de vente ne peut pas être négatif.' })
  prixVente?: number;

  @IsOptional()
  @IsInt({ message: 'Le taux de TVA doit être un nombre entier.' })
  @Min(0, { message: 'Le taux de TVA ne peut pas être négatif.' })
  @Max(100, { message: 'Le taux de TVA ne peut pas dépasser 100%.' })
  tauxTva?: number;

  @IsOptional()
  @IsInt({ message: 'Le seuil doit être un nombre entier.' })
  @Min(0, { message: 'Le seuil ne peut pas être négatif.' })
  seuilAlerte?: number;
}

/**
 * Valeurs par défaut du modèle (n'affectent que les variantes créées
 * ensuite) et attributs : ajouter des valeurs crée les variantes
 * manquantes ; retirer une valeur ou changer d'axe est refusé.
 */
export class ModifierModeleDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Le nom du modèle est requis.' })
  @MaxLength(120)
  nom?: string;

  /** Préfixe des références générées (« TSHIRT » → TSHIRT-ROUGE-M). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  reference?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Indiquez au moins un attribut (Taille, Couleur…).' })
  @ArrayMaxSize(3, { message: 'Trois attributs au maximum par modèle.' })
  @ValidateNested({ each: true })
  @Type(() => AttributDto)
  attributs?: AttributDto[];

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

  @IsOptional()
  @IsInt({ message: 'Le prix d’achat doit être un nombre entier.' })
  @Min(0, { message: 'Le prix d’achat ne peut pas être négatif.' })
  prixAchat?: number;

  @IsOptional()
  @IsInt({ message: 'Le prix de vente doit être un nombre entier.' })
  @Min(0, { message: 'Le prix de vente ne peut pas être négatif.' })
  prixVente?: number;

  @IsOptional()
  @IsInt({ message: 'Le taux de TVA doit être un nombre entier.' })
  @Min(0, { message: 'Le taux de TVA ne peut pas être négatif.' })
  @Max(100, { message: 'Le taux de TVA ne peut pas dépasser 100%.' })
  tauxTva?: number;

  @IsOptional()
  @IsInt({ message: 'Le seuil doit être un nombre entier.' })
  @Min(0, { message: 'Le seuil ne peut pas être négatif.' })
  seuilAlerte?: number;
}
