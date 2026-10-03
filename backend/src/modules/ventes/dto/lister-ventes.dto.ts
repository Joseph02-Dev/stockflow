import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { LIMITE_MAX } from '../../../common/pagination/pagination.js';

export class ListerVentesDto {
  @IsOptional()
  @IsUUID('4')
  clientId?: string;

  @IsOptional()
  @IsUUID('4')
  emplacementId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date de début invalide.' })
  du?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date de fin invalide.' })
  au?: string;

  /** Taille de page (50 par défaut). */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La limite doit être un entier.' })
  @Min(1)
  @Max(LIMITE_MAX)
  limite?: number;

  /** Curseur : identifiant de la dernière vente reçue. */
  @IsOptional()
  @IsUUID('4', { message: 'Curseur de pagination invalide.' })
  apres?: string;
}
