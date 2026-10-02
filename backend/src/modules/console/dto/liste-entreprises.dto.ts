import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ETATS_ENTREPRISE } from '../console-entreprises.service.js';
import type { EtatEntreprise } from '../console-entreprises.service.js';

export class ListeEntreprisesDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  recherche?: string;

  @IsOptional()
  @IsIn(ETATS_ENTREPRISE, { message: 'Filtre d’état inconnu.' })
  etat?: EtatEntreprise;
}
