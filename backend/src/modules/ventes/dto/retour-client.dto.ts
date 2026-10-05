import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  MOTIFS_PERTE,
  type MotifPerteDto,
} from '../../pertes/dto/pertes.dto.js';

export const ETATS_RETOUR = [
  'REMISE_EN_STOCK',
  'CASSE',
  'RETOUR_FOURNISSEUR',
] as const;
export const COMPENSATIONS_RETOUR = ['DEDUIRE_DETTE', 'REMBOURSEMENT'] as const;

export class LigneRetourClientDto {
  @IsUUID('4', { message: 'ligneVenteId doit être un identifiant valide.' })
  ligneVenteId!: string;

  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(1, { message: 'La quantité doit être supérieure à 0.' })
  quantite!: number;
}

export class RetourClientDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Indiquez au moins une ligne retournée.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LigneRetourClientDto)
  lignes!: LigneRetourClientDto[];

  @IsIn(ETATS_RETOUR, {
    message: 'Indiquez l’état de la marchandise retournée.',
  })
  etat!: (typeof ETATS_RETOUR)[number];

  /** Obligatoire quand la marchandise est déclarée en casse. */
  @ValidateIf((dto: RetourClientDto) => dto.etat === 'CASSE')
  @IsIn(MOTIFS_PERTE, { message: 'Choisissez le motif de la perte.' })
  motifPerte?: MotifPerteDto;

  /** Obligatoire quand la marchandise repart chez le fournisseur. */
  @ValidateIf((dto: RetourClientDto) => dto.etat === 'RETOUR_FOURNISSEUR')
  @IsUUID('4', { message: 'Choisissez le fournisseur.' })
  fournisseurId?: string;

  @IsIn(COMPENSATIONS_RETOUR, {
    message: 'Indiquez comment le client est dédommagé.',
  })
  compensation!: (typeof COMPENSATIONS_RETOUR)[number];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(500, { message: '500 caractères au maximum.' })
  commentaire?: string;
}
