import { IsInt, IsUUID, Min } from 'class-validator';

export class SortieStockDto {
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId!: string;

  @IsUUID('4', { message: 'emplacementId doit être un identifiant valide.' })
  emplacementId!: string;

  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(1, { message: 'La quantité doit être supérieure à 0.' })
  quantite!: number;
}
