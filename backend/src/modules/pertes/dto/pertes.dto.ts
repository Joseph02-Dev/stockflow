import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';

export const MOTIFS_PERTE = [
  'CASSE_MANUTENTION',
  'DEGAT_EAUX',
  'VOL',
  'ERREUR_SAISIE',
  'AUTRE',
] as const;
export type MotifPerteDto = (typeof MOTIFS_PERTE)[number];

const nettoyer = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class DeclarerCasseDto {
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId!: string;

  @IsUUID('4', { message: 'emplacementId doit être un identifiant valide.' })
  emplacementId!: string;

  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(1, { message: 'La quantité doit être supérieure à 0.' })
  quantite!: number;

  /** Obligatoire : sans motif, la casse redevient un trou noir. */
  @IsIn(MOTIFS_PERTE, { message: 'Choisissez le motif de la perte.' })
  motif!: MotifPerteDto;

  @IsOptional()
  @Transform(nettoyer)
  @IsString()
  @MaxLength(500, { message: 'La précision dépasse 500 caractères.' })
  commentaire?: string;

  @IsOptional()
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'photoUrl doit être une URL https valide.' },
  )
  photoUrl?: string;

  /** Produit suivi par lot : lot désigné ; sinon ordre des péremptions. */
  @IsOptional()
  @IsUUID('4', { message: 'lotId doit être un identifiant valide.' })
  lotId?: string;
}

export class AnnulerPerteDto {
  @Transform(nettoyer)
  @IsString({ message: 'Le motif d’annulation est obligatoire.' })
  @MinLength(3, {
    message: 'Le motif d’annulation est obligatoire (3 caractères au moins).',
  })
  @MaxLength(300)
  motif!: string;
}

export class FiltresPertesDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date de début au format AAAA-MM-JJ.',
  })
  debut?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date de fin au format AAAA-MM-JJ.',
  })
  fin?: string;

  @IsOptional()
  @IsIn(MOTIFS_PERTE, { message: 'Motif inconnu.' })
  motif?: MotifPerteDto;

  @IsOptional()
  @IsUUID('4')
  emplacementId?: string;

  @IsOptional()
  @IsUUID('4')
  utilisateurId?: string;

  @IsOptional()
  @IsString()
  limite?: string;

  @IsOptional()
  @IsString()
  apres?: string;
}
