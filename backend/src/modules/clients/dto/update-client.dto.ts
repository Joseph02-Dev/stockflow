import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { CATEGORIES_TARIFAIRES, FORMAT_TELEPHONE, MESSAGE_TELEPHONE } from './create-client.dto.js';
import type { CategorieTarifaire } from './create-client.dto.js';

/** Champs facultatifs ; null efface le téléphone, le commerce ou le plafond. */
export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Le nom du client est requis.' })
  @MaxLength(150)
  nom?: string;

  @ValidateIf((_, valeur) => valeur !== null && valeur !== undefined)
  @IsString()
  @Matches(FORMAT_TELEPHONE, { message: MESSAGE_TELEPHONE })
  telephone?: string | null;

  @ValidateIf((_, valeur) => valeur !== null && valeur !== undefined)
  @IsString()
  @MaxLength(150)
  nomCommerce?: string | null;

  @IsOptional()
  @IsIn(CATEGORIES_TARIFAIRES, { message: 'Catégorie tarifaire invalide (GROS, DEMI_GROS ou DETAIL).' })
  categorie?: CategorieTarifaire;

  @ValidateIf((_, valeur) => valeur !== null && valeur !== undefined)
  @IsInt({ message: 'Le plafond de crédit doit être un montant entier en GNF.' })
  @Min(0, { message: 'Le plafond de crédit ne peut pas être négatif.' })
  plafondCredit?: number | null;
}
