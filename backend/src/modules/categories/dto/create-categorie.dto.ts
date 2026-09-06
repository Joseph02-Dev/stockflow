import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCategorieDto {
  @IsString()
  @MinLength(1, { message: 'Le nom de la catégorie est requis.' })
  @MaxLength(80)
  nom!: string;
}
