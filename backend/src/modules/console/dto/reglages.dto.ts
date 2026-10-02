import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const MESSAGE_LIMITE = 'Une limite est un entier entre 1 et 100 000, ou null pour « illimité ».';

/**
 * Champ absent = inchangé ; null = illimité ; entier = nouvelle limite.
 * ValidateIf laisse passer null (illimité) mais valide tout le reste.
 */
export class ReglagesDto {
  @ValidateIf((o: ReglagesDto) => o.limiteEmplacements !== null && o.limiteEmplacements !== undefined)
  @IsInt({ message: MESSAGE_LIMITE })
  @Min(1, { message: MESSAGE_LIMITE })
  @Max(100_000, { message: MESSAGE_LIMITE })
  limiteEmplacements?: number | null;

  @ValidateIf((o: ReglagesDto) => o.limiteUtilisateurs !== null && o.limiteUtilisateurs !== undefined)
  @IsInt({ message: MESSAGE_LIMITE })
  @Min(1, { message: MESSAGE_LIMITE })
  @Max(100_000, { message: MESSAGE_LIMITE })
  limiteUtilisateurs?: number | null;

  @ValidateIf((o: ReglagesDto) => o.limiteReferences !== null && o.limiteReferences !== undefined)
  @IsInt({ message: MESSAGE_LIMITE })
  @Min(1, { message: MESSAGE_LIMITE })
  @Max(100_000, { message: MESSAGE_LIMITE })
  limiteReferences?: number | null;

  @IsOptional()
  @IsBoolean()
  moduleInventaires?: boolean;

  @IsOptional()
  @IsBoolean()
  moduleTransferts?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  motif?: string;
}
