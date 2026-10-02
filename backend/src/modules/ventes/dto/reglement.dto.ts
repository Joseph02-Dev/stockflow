import { IsIn, IsInt, Min } from 'class-validator';
import { MODES_REGLEMENT, type ModeReglement } from './creer-vente.dto.js';

export class ReglementDto {
  @IsInt({ message: 'Le montant doit être un nombre entier de GNF.' })
  @Min(1, { message: 'Le montant doit être positif.' })
  montant!: number;

  @IsIn(MODES_REGLEMENT, {
    message: 'Mode de règlement invalide (espèces, Orange Money ou MTN MoMo).',
  })
  mode!: ModeReglement;
}
