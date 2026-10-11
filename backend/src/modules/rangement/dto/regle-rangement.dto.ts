import { IsOptional, IsUUID } from 'class-validator';

/** Un produit OU une catégorie ; arrivée facultative (nulle : toute arrivée). */
export class CreerRegleRangementDto {
  @IsOptional()
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'categorieId doit être un identifiant valide.' })
  categorieId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'emplacementReceptionId doit être un identifiant valide.' })
  emplacementReceptionId?: string;

  @IsUUID('4', { message: 'emplacementId doit être un identifiant valide.' })
  emplacementId!: string;
}
