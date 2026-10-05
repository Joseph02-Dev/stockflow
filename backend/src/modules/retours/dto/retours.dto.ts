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
  MinLength,
  ValidateNested,
} from 'class-validator';

const nettoyer = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class LigneRetourFournisseurDto {
  @IsUUID('4', { message: 'produitId doit être un identifiant valide.' })
  produitId!: string;

  @IsInt({ message: 'La quantité doit être un nombre entier.' })
  @Min(1, { message: 'La quantité doit être supérieure à 0.' })
  quantite!: number;

  /** Produit suivi par lot : lot désigné ; sinon ordre des péremptions. */
  @IsOptional()
  @IsUUID('4', { message: 'lotId doit être un identifiant valide.' })
  lotId?: string;
}

export class CreerRetourFournisseurDto {
  @IsUUID('4', { message: 'fournisseurId doit être un identifiant valide.' })
  fournisseurId!: string;

  @IsUUID('4', { message: 'emplacementId doit être un identifiant valide.' })
  emplacementId!: string;

  @Transform(nettoyer)
  @IsString({ message: 'Le motif du retour est obligatoire.' })
  @MinLength(3, {
    message: 'Le motif du retour est obligatoire (3 caractères au moins).',
  })
  @MaxLength(300)
  motif!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Ajoutez au moins un produit à renvoyer.' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LigneRetourFournisseurDto)
  lignes!: LigneRetourFournisseurDto[];
}

export class AvoirDto {
  @IsIn(['RECU', 'REFUSE'], { message: 'Statut d’avoir : RECU ou REFUSE.' })
  statut!: 'RECU' | 'REFUSE';
}
