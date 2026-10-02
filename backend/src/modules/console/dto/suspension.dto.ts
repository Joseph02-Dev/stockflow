import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const nettoyer = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SuspendreDto {
  // Obligatoire : une suspension sans motif ne serait pas auditable.
  @Transform(nettoyer)
  @IsString({ message: 'Le motif est obligatoire.' })
  @IsNotEmpty({ message: 'Le motif est obligatoire.' })
  @MaxLength(500)
  motif!: string;
}

export class RetablirDto {
  @IsOptional()
  @Transform(nettoyer)
  @IsString()
  @MaxLength(500)
  motif?: string;
}
