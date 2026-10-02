import { IsDateString, IsOptional, IsUUID } from 'class-validator';

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
}
