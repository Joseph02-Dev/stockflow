import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

const SECTEURS = ['MATERIAUX', 'COMMERCE', 'ARTISANAT', 'AUTRE'] as const;

export class UpdateEntrepriseDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Le nom de l'entreprise doit contenir au moins 2 caractères." })
  @MaxLength(100)
  nom?: string;

  @IsOptional()
  @IsIn(SECTEURS, { message: 'Secteur d’activité invalide.' })
  secteurActivite?: (typeof SECTEURS)[number];

  @IsOptional()
  @IsInt({ message: 'Le taux de TVA par défaut doit être un nombre entier.' })
  @Min(0)
  @Max(100)
  tauxTvaParDefaut?: number;
}
