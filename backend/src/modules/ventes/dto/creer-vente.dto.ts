import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export const MODES_PAIEMENT = [
  'ESPECES',
  'ORANGE_MONEY',
  'MTN_MOMO',
  'CREDIT',
] as const;
export type ModePaiement = (typeof MODES_PAIEMENT)[number];
/** Un règlement est toujours un vrai encaissement : jamais « CREDIT ». */
export const MODES_REGLEMENT = ['ESPECES', 'ORANGE_MONEY', 'MTN_MOMO'] as const;
export type ModeReglement = (typeof MODES_REGLEMENT)[number];

export class LigneVenteDto {
  @IsUUID('4', { message: 'Produit invalide.' })
  produitId!: string;

  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(1, { message: 'La quantité doit être d’au moins 1.' })
  quantite!: number;
}

export class AvanceDto {
  @IsInt({ message: 'L’avance doit être un montant entier en GNF.' })
  @Min(1, { message: 'L’avance doit être positive.' })
  montant!: number;

  @IsIn(MODES_REGLEMENT, { message: 'Mode de règlement de l’avance invalide.' })
  mode!: ModeReglement;
}

/**
 * Seuls les produits et quantités viennent du client : prix, libellés,
 * taux et totaux sont toujours déterminés par le serveur. Un champ de
 * total envoyé quand même est rejeté par la validation (whitelist).
 */
export class CreerVenteDto {
  @IsOptional()
  @IsUUID('4', { message: 'Client invalide.' })
  clientId?: string;

  @IsUUID('4', { message: 'Emplacement invalide.' })
  emplacementId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Une vente contient au moins une ligne.' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LigneVenteDto)
  lignes!: LigneVenteDto[];

  @IsOptional()
  @IsInt({ message: 'Le taux de remise doit être un pourcentage entier.' })
  @Min(0, { message: 'Le taux de remise ne peut pas être négatif.' })
  @Max(100, { message: 'Le taux de remise ne peut pas dépasser 100 %.' })
  tauxRemise?: number;

  @IsIn(MODES_PAIEMENT, { message: 'Mode de paiement invalide.' })
  modePaiement!: ModePaiement;

  /** Vente à crédit uniquement : montant versé tout de suite. */
  @IsOptional()
  @ValidateNested()
  @Type(() => AvanceDto)
  avance?: AvanceDto;

  /** Vente à crédit uniquement : date limite de paiement du solde. */
  @IsOptional()
  @IsDateString({}, { message: 'Échéance invalide.' })
  echeanceAt?: string;
}
