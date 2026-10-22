import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class TransfertStockDto {
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId!: string;

  @IsUUID('4', {
    message: 'emplacementSourceId doit être un identifiant valide.',
  })
  emplacementSourceId!: string;

  @IsUUID('4', {
    message: 'emplacementDestinationId doit être un identifiant valide.',
  })
  emplacementDestinationId!: string;

  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(1, { message: 'La quantité doit être supérieure à 0.' })
  quantite!: number;

  /**
   * Produit suivi par lot : lot à transférer. Absent, la quantité est
   * prise dans l'ordre FEFO, lot par lot.
   */
  @IsOptional()
  @IsUUID('4', { message: 'lotId doit être un identifiant valide.' })
  lotId?: string;

  /** Quantité saisie dans ce conditionnement (carton…), convertie en unités. */
  @IsOptional()
  @IsUUID('4', { message: 'conditionnementId doit être un identifiant valide.' })
  conditionnementId?: string;

  /**
   * Identifiant créé sur l'appareil pour une opération saisie hors ligne :
   * un renvoi du même identifiant n'est jamais appliqué deux fois.
   */
  @IsOptional()
  @IsUUID('4', { message: 'idClient doit être un identifiant valide.' })
  idClient?: string;
}
