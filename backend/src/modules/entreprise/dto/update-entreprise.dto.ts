import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

/** Chaîne vide ou blanche → null : le champ est effacé. */
const videVersNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);
/** Le champ n'est validé que s'il porte une valeur (null efface). */
const renseigne = (_: object, valeur: unknown) => valeur !== null && valeur !== undefined;

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

  // Coordonnées imprimées en en-tête des rapports PDF. null efface le champ.
  @Transform(videVersNull)
  @ValidateIf(renseigne)
  @IsString()
  @MaxLength(200, { message: 'L’adresse ne peut pas dépasser 200 caractères.' })
  adresse?: string | null;

  @Transform(videVersNull)
  @ValidateIf(renseigne)
  @IsString()
  @MaxLength(40)
  telephone?: string | null;

  @Transform(videVersNull)
  @ValidateIf(renseigne)
  @IsEmail({}, { message: 'Adresse email invalide.' })
  @MaxLength(120)
  email?: string | null;

  @Transform(videVersNull)
  @ValidateIf(renseigne)
  @IsString()
  @MaxLength(60, { message: 'Le numéro RCCM ne peut pas dépasser 60 caractères.' })
  rccm?: string | null;

  @Transform(videVersNull)
  @ValidateIf(renseigne)
  @IsString()
  @MaxLength(60, { message: 'Le NIF ne peut pas dépasser 60 caractères.' })
  nif?: string | null;

  /** Logo envoyé via /uploads/image?type=entreprise (URL https du CDN). */
  @Transform(videVersNull)
  @ValidateIf(renseigne)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Le logo doit être une URL https.' })
  @MaxLength(500)
  logoUrl?: string | null;
}
