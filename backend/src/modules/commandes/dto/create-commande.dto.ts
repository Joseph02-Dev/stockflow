import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { LigneCommandeDto } from './ligne-commande.dto.js';

/** Fournisseur saisi par son seul nom dans le bon de commande : créé avec la commande. */
export class NouveauFournisseurDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Le nom du fournisseur est requis.' })
  @MaxLength(150)
  nom!: string;
}

export class CreateCommandeDto {
  /** Fournisseur existant ; sinon nouveauFournisseur. */
  @ValidateIf((dto: CreateCommandeDto) => !dto.nouveauFournisseur)
  @IsUUID('4', { message: 'Choisissez un fournisseur ou saisissez le nom d’un nouveau fournisseur.' })
  fournisseurId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NouveauFournisseurDto)
  nouveauFournisseur?: NouveauFournisseurDto;

  @IsUUID('4', { message: 'emplacementId doit être un identifiant valide.' })
  emplacementId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'La commande doit contenir au moins une ligne.' })
  @ValidateNested({ each: true })
  @Type(() => LigneCommandeDto)
  lignes!: LigneCommandeDto[];
}
