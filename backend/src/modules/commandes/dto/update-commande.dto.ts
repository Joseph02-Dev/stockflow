import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LigneCommandeDto } from './ligne-commande.dto.js';

export class UpdateCommandeDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'La commande doit contenir au moins une ligne.' })
  @ValidateNested({ each: true })
  @Type(() => LigneCommandeDto)
  lignes!: LigneCommandeDto[];
}
