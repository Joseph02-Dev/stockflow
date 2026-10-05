import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { TYPES_MOUVEMENT_RAPPORT } from '../rapports.types.js';

/** « true » / « false » en query string → booléen ; absent → valeur par défaut. */
const booleen = (defaut: boolean) => ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? defaut : value === true || value === 'true' || value === '1';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class FormatDto {
  @IsOptional()
  @IsIn(['pdf', 'csv'], { message: 'Format attendu : pdf ou csv.' })
  format: 'pdf' | 'csv' = 'pdf';
}

export class PeriodeDto extends FormatDto {
  @IsOptional()
  @Matches(DATE, { message: 'Date de début au format AAAA-MM-JJ.' })
  debut?: string;

  @IsOptional()
  @Matches(DATE, { message: 'Date de fin au format AAAA-MM-JJ.' })
  fin?: string;
}

export class RapportStockDto extends FormatDto {
  @IsOptional()
  @IsUUID('4', { message: 'emplacementId doit être un identifiant valide.' })
  emplacementId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'categorieId doit être un identifiant valide.' })
  categorieId?: string;

  @Transform(booleen(true))
  @IsBoolean()
  detail: boolean = true;

  @Transform(booleen(true))
  @IsBoolean()
  graphiques: boolean = true;

  @Transform(booleen(false))
  @IsBoolean()
  signature: boolean = false;
}

export class RapportMouvementsDto extends PeriodeDto {
  @IsOptional()
  @IsUUID('4', { message: 'emplacementId doit être un identifiant valide.' })
  emplacementId?: string;

  @IsOptional()
  @IsIn(TYPES_MOUVEMENT_RAPPORT, { message: 'Type de mouvement inconnu.' })
  type?: (typeof TYPES_MOUVEMENT_RAPPORT)[number];

  @Transform(booleen(false))
  @IsBoolean()
  signature: boolean = false;
}

export class RapportPeriodeDto extends PeriodeDto {
  @Transform(booleen(true))
  @IsBoolean()
  detail: boolean = true;

  @Transform(booleen(true))
  @IsBoolean()
  graphiques: boolean = true;

  @Transform(booleen(false))
  @IsBoolean()
  signature: boolean = false;
}
