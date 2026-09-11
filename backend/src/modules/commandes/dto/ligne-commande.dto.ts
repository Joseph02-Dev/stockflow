import { IsInt, IsUUID, Min } from 'class-validator';

export class LigneCommandeDto {
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId!: string;

  @IsInt({ message: 'La quantité commandée doit être un nombre entier.' })
  @Min(1, { message: 'La quantité commandée doit être supérieure à 0.' })
  quantiteCommandee!: number;
}
