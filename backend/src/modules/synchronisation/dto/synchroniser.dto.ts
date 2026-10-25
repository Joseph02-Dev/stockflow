import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SynchroniserDto {
  /** Curseur renvoyé par l'appel précédent ; absent : instantané complet. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  depuis?: string;
}
