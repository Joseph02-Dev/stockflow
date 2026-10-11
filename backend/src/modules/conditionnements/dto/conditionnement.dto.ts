import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

const nettoyer = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreerConditionnementDto {
  @Transform(nettoyer)
  @IsString()
  @MinLength(1, { message: 'Le nom du conditionnement est requis (Carton, Palette…).' })
  @MaxLength(40)
  nom!: string;

  /** Nombre d'unités de base contenues : 20 pour un carton de 20. */
  @IsInt({ message: 'Le nombre d’unités doit être un entier.' })
  @Min(2, { message: 'Un conditionnement contient au moins 2 unités.' })
  @Max(1_000_000)
  facteur!: number;

  @IsOptional()
  @Transform(nettoyer)
  @IsString()
  @MaxLength(60)
  codeBarre?: string;
}

/** Le facteur ne change pas : les mouvements passés l'ont figé. Archivez et recréez. */
export class ModifierConditionnementDto {
  @IsOptional()
  @Transform(nettoyer)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  nom?: string;

  @IsOptional()
  @Transform(nettoyer)
  @IsString()
  @MaxLength(60)
  codeBarre?: string;
}
