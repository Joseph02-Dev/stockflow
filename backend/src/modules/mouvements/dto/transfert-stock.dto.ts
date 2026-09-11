import { IsInt, IsUUID, Min } from 'class-validator';

export class TransfertStockDto {
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId!: string;

  @IsUUID('4', { message: 'emplacementSourceId doit être un identifiant valide.' })
  emplacementSourceId!: string;

  @IsUUID('4', { message: 'emplacementDestinationId doit être un identifiant valide.' })
  emplacementDestinationId!: string;

  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(1, { message: 'La quantité doit être supérieure à 0.' })
  quantite!: number;
}
