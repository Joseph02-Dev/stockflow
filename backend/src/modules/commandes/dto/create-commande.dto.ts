import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LigneCommandeDto } from './ligne-commande.dto.js';

export class CreateCommandeDto {
  @IsUUID('4', { message: 'fournisseurId doit être un identifiant valide.' })
  fournisseurId!: string;

  @IsUUID('4', { message: 'emplacementId doit être un identifiant valide.' })
  emplacementId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'La commande doit contenir au moins une ligne.' })
  @ValidateNested({ each: true })
  @Type(() => LigneCommandeDto)
  lignes!: LigneCommandeDto[];
}
