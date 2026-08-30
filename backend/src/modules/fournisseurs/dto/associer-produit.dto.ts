import { IsUUID } from 'class-validator';

export class AssocierProduitDto {
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId!: string;
}
