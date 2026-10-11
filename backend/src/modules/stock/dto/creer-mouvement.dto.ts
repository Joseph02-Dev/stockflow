import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { NatureEmplacement } from '../../../generated/prisma/enums.js';

const NATURES: NatureEmplacement[] = ['INTERNE', 'FOURNISSEUR', 'CLIENT', 'REBUT', 'INVENTAIRE', 'TRANSIT'];

/** Une extrémité : un emplacement réel (INTERNE + emplacementId) ou virtuel. */
export class ExtremiteDto {
  @IsIn(NATURES, { message: `nature doit valoir ${NATURES.join(', ')}.` })
  nature!: NatureEmplacement;

  @IsOptional()
  @IsUUID('4', { message: 'emplacementId doit être un identifiant valide.' })
  emplacementId?: string;
}

/**
 * Mouvement générique en double entrée : source → destination. Les sens
 * courants (réception, sortie, transfert) passent par les mêmes règles que
 * les écrans dédiés ; les autres (casse, retours, ajustements) exigent leur
 * document propre et sont refusés ici.
 */
export class CreerMouvementDto {
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId!: string;

  @ValidateNested()
  @Type(() => ExtremiteDto)
  source!: ExtremiteDto;

  @ValidateNested()
  @Type(() => ExtremiteDto)
  destination!: ExtremiteDto;

  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(1, { message: 'La quantité doit être supérieure à 0.' })
  quantite!: number;

  @IsOptional()
  @IsUUID('4', { message: 'fournisseurId doit être un identifiant valide.' })
  fournisseurId?: string;

  /** Quantité saisie dans ce conditionnement (module « conditionnements »). */
  @IsOptional()
  @IsUUID('4', { message: 'conditionnementId doit être un identifiant valide.' })
  conditionnementId?: string;

  /** Réception d'un produit suivi par numéro de série : un numéro par unité. */
  @IsOptional()
  @IsArray({ message: 'numerosSerie doit être une liste.' })
  @ArrayMaxSize(1000, { message: '1 000 numéros de série au maximum par entrée.' })
  @IsString({ each: true, message: 'Chaque numéro de série doit être un texte.' })
  @MaxLength(60, { each: true, message: 'Un numéro de série dépasse 60 caractères.' })
  numerosSerie?: string[];

  /** Réception : coût d'achat unitaire en GNF (module « valorisation »). */
  @IsOptional()
  @IsInt({ message: 'Le coût unitaire doit être un nombre entier (GNF).' })
  @Min(0, { message: 'Le coût unitaire ne peut pas être négatif.' })
  coutUnitaire?: number;

  /** Transfert d'un produit suivi par lot : lot désigné (sinon ordre FEFO). */
  @IsOptional()
  @IsUUID('4', { message: 'lotId doit être un identifiant valide.' })
  lotId?: string;

  /** Réception d'un produit suivi par lot. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Le numéro de lot doit être un texte.' })
  @IsNotEmpty({ message: 'Le numéro de lot est vide.' })
  @MaxLength(60, { message: 'Le numéro de lot dépasse 60 caractères.' })
  numeroLot?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'La date de péremption n’est pas une date valide.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La date de péremption doit être au format AAAA-MM-JJ.' })
  datePeremption?: string;
}
