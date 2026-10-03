import { Transform } from 'class-transformer';
import {
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
}
