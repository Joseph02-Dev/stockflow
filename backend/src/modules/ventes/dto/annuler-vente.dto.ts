import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnnulerVenteDto {
  @IsString()
  @MinLength(3, {
    message: 'Le motif d’annulation est obligatoire (3 caractères minimum).',
  })
  @MaxLength(300)
  motif!: string;
}
