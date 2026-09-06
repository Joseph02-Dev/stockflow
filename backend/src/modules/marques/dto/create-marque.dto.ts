import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMarqueDto {
  @IsString()
  @MinLength(1, { message: 'Le nom de la marque est requis.' })
  @MaxLength(80)
  nom!: string;
}
