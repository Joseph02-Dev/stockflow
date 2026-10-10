import { IsIn, IsOptional, IsUUID } from 'class-validator';

export const PERIODES = ['7j', '30j', '12m'] as const;
export type Periode = (typeof PERIODES)[number];

export class StatistiquesQueryDto {
  @IsOptional()
  @IsIn(PERIODES, { message: 'periode doit valoir 7j, 30j ou 12m.' })
  periode?: Periode;
}

export class StockHebdoQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId?: string;
}
