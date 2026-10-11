import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Lot reçu pour une ligne dont le produit est suivi par lot (numéro et
 * date), ou numéros de série reçus pour un produit suivi par série.
 */
export class LotReceptionDto {
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId!: string;

  @IsOptional()
  @IsString({ message: 'Le numéro de lot doit être un texte.' })
  @IsNotEmpty({ message: 'Le numéro de lot est vide.' })
  @MaxLength(60, { message: 'Le numéro de lot dépasse 60 caractères.' })
  numeroLot?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'La date de péremption n’est pas une date valide.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date de péremption doit être au format AAAA-MM-JJ.' })
  datePeremption?: string;

  @IsOptional()
  @IsArray({ message: 'numerosSerie doit être une liste.' })
  @ArrayMaxSize(1000, { message: '1 000 numéros de série au maximum par ligne.' })
  @IsString({ each: true, message: 'Chaque numéro de série doit être un texte.' })
  @MaxLength(60, { each: true, message: 'Un numéro de série dépasse 60 caractères.' })
  numerosSerie?: string[];
}

/** Corps facultatif : seules les commandes contenant un produit suivi par lot l'exigent. */
export class RecevoirCommandeDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LotReceptionDto)
  lots?: LotReceptionDto[];
}
