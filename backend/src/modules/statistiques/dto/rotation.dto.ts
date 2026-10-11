import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RotationQueryDto {
  /** Période d'observation en jours (90 par défaut). */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'jours doit être un nombre entier.' })
  @Min(7, { message: 'La période est d’au moins 7 jours.' })
  @Max(730, { message: 'La période est de 730 jours au plus.' })
  jours?: number;
}
