import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export const CATEGORIES_TARIFAIRES = ['GROS', 'DEMI_GROS', 'DETAIL'] as const;
export type CategorieTarifaire = (typeof CATEGORIES_TARIFAIRES)[number];

/**
 * Téléphone au format international : « + », indicatif, puis chiffres
 * éventuellement séparés par des espaces ou des tirets
 * (ex. +224 622 45 18 03). Il servira aux liens WhatsApp, qui exigent
 * l'indicatif pays.
 */
export const FORMAT_TELEPHONE = /^\+\d[\d\s-]{6,18}\d$/;
export const MESSAGE_TELEPHONE = 'Téléphone au format international attendu, ex. +224 622 45 18 03.';

export class CreateClientDto {
  @IsString()
  @MinLength(1, { message: 'Le nom du client est requis.' })
  @MaxLength(150)
  nom!: string;

  @IsOptional()
  @IsString()
  @Matches(FORMAT_TELEPHONE, { message: MESSAGE_TELEPHONE })
  telephone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  nomCommerce?: string;

  @IsOptional()
  @IsIn(CATEGORIES_TARIFAIRES, { message: 'Catégorie tarifaire invalide (GROS, DEMI_GROS ou DETAIL).' })
  categorie?: CategorieTarifaire;

  @IsOptional()
  @IsInt({ message: 'Le plafond de crédit doit être un montant entier en GNF.' })
  @Min(0, { message: 'Le plafond de crédit ne peut pas être négatif.' })
  plafondCredit?: number;
}
