import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class EntreeStockDto {
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId!: string;

  @IsUUID('4', { message: 'emplacementId doit être un identifiant valide.' })
  emplacementId!: string;

  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(1, { message: 'La quantité doit être supérieure à 0.' })
  quantite!: number;

  @IsOptional()
  @IsUUID('4', { message: 'fournisseurId doit être un identifiant valide.' })
  fournisseurId?: string;

  /** Obligatoires pour un produit suivi par lot, refusés sinon. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Le numéro de lot doit être un texte.' })
  @IsNotEmpty({ message: 'Le numéro de lot est vide.' })
  @MaxLength(60, { message: 'Le numéro de lot dépasse 60 caractères.' })
  numeroLot?: string;

  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'La date de péremption n’est pas une date valide.' },
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La date de péremption doit être au format AAAA-MM-JJ.',
  })
  datePeremption?: string;

  /** Produit suivi par numéro de série : un numéro par unité reçue. */
  @IsOptional()
  @IsArray({ message: 'numerosSerie doit être une liste.' })
  @ArrayMaxSize(1000, { message: '1 000 numéros de série au maximum par entrée.' })
  @IsString({ each: true, message: 'Chaque numéro de série doit être un texte.' })
  @MaxLength(60, { each: true, message: 'Un numéro de série dépasse 60 caractères.' })
  numerosSerie?: string[];

  /** Quantité saisie dans ce conditionnement (carton…), convertie en unités. */
  @IsOptional()
  @IsUUID('4', { message: 'conditionnementId doit être un identifiant valide.' })
  conditionnementId?: string;
}
