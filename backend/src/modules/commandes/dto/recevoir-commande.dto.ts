import { Type } from 'class-transformer';
import { IsArray, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';

/** Lot reçu pour une ligne dont le produit est suivi par lot. */
export class LotReceptionDto {
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId!: string;

  @IsString({ message: 'Le numéro de lot doit être un texte.' })
  @IsNotEmpty({ message: 'Le numéro de lot est vide.' })
  @MaxLength(60, { message: 'Le numéro de lot dépasse 60 caractères.' })
  numeroLot!: string;

  @IsISO8601({ strict: true }, { message: 'La date de péremption n’est pas une date valide.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date de péremption doit être au format AAAA-MM-JJ.' })
  datePeremption!: string;
}

/** Corps facultatif : seules les commandes contenant un produit suivi par lot l'exigent. */
export class RecevoirCommandeDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LotReceptionDto)
  lots?: LotReceptionDto[];
}
