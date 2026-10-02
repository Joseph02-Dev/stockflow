import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from './pagination.dto.js';

export const ACTIONS_AUDIT = [
  'CONNEXION',
  'CONSULTATION_ENTREPRISE',
  'SUSPENSION',
  'RETABLISSEMENT',
  'MODIFICATION_REGLAGES',
] as const;

export class JournalDto extends PaginationDto {
  @IsOptional()
  @IsUUID('4', { message: 'Identifiant d’entreprise invalide.' })
  entrepriseId?: string;

  @IsOptional()
  @IsIn(ACTIONS_AUDIT, { message: 'Action inconnue.' })
  action?: (typeof ACTIONS_AUDIT)[number];
}
