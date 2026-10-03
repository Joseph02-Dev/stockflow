import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Taille maximale d'un lot de lignes : reste sous la limite de 1 Mo par requête. */
export const LIGNES_PAR_LOT = 200;
/** Nombre maximal de lignes d'un fichier importé. */
export const LIGNES_MAX = 5000;

export class OuvrirImportDto {
  @IsString({ message: 'Le nom du fichier est requis.' })
  @IsNotEmpty({ message: 'Le nom du fichier est requis.' })
  @MaxLength(255)
  nomFichier!: string;
}

/**
 * Valeurs brutes d'une ligne, déjà associées aux champs StockFlow. Toutes
 * facultatives et textuelles : le serveur les interprète lui-même.
 */
export class ValeursLigneDto {
  @IsOptional() @IsString() @MaxLength(500) nom?: string;
  @IsOptional() @IsString() @MaxLength(500) reference?: string;
  @IsOptional() @IsString() @MaxLength(500) codeBarre?: string;
  @IsOptional() @IsString() @MaxLength(500) categorie?: string;
  @IsOptional() @IsString() @MaxLength(500) marque?: string;
  @IsOptional() @IsString() @MaxLength(500) uniteMesure?: string;
  @IsOptional() @IsString() @MaxLength(100) prixAchat?: string;
  @IsOptional() @IsString() @MaxLength(100) prixVente?: string;
  @IsOptional() @IsString() @MaxLength(100) prixDemiGros?: string;
  @IsOptional() @IsString() @MaxLength(100) prixGros?: string;
  @IsOptional() @IsString() @MaxLength(100) tauxTva?: string;
  @IsOptional() @IsString() @MaxLength(100) seuilAlerte?: string;
  @IsOptional() @IsString() @MaxLength(100) quantite?: string;
  @IsOptional() @IsString() @MaxLength(500) numeroLot?: string;
  @IsOptional() @IsString() @MaxLength(100) datePeremption?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
}

export class LigneImportDto {
  /** Numéro de la ligne dans le fichier (en-tête = ligne 1). */
  @IsInt({ message: 'Numéro de ligne invalide.' })
  @Min(2)
  @Max(LIGNES_MAX + 1)
  numero!: number;

  @ValidateNested()
  @Type(() => ValeursLigneDto)
  valeurs!: ValeursLigneDto;
}

export class LotLignesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Aucune ligne envoyée.' })
  @ArrayMaxSize(LIGNES_PAR_LOT, {
    message: `Au plus ${LIGNES_PAR_LOT} lignes par envoi.`,
  })
  @ValidateNested({ each: true })
  @Type(() => LigneImportDto)
  lignes!: LigneImportDto[];
}

/** Choix faits à la vérification, renvoyés à l'identique à l'exécution. */
export class OptionsImportDto {
  /** Emplacement qui reçoit les quantités initiales. */
  @IsOptional()
  @IsUUID('4', { message: 'emplacementId doit être un identifiant valide.' })
  emplacementId?: string;

  /** Catégorie du fichier → catégorie existante (sinon créée). */
  @IsOptional()
  @IsObject()
  categories?: Record<string, string>;

  /** Marque du fichier → marque existante (sinon créée). */
  @IsOptional()
  @IsObject()
  marques?: Record<string, string>;

  /** Doublons dans le fichier : numéros des lignes à conserver. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIGNES_MAX)
  @IsInt({ each: true })
  conserver?: number[];

  @IsOptional()
  @IsBoolean()
  ignorerBloquees?: boolean;
}
