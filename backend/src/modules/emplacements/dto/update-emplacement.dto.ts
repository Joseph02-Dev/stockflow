import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateEmplacementDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "Le nom de l'emplacement doit contenir au moins 2 caractères." })
  @MaxLength(100)
  nom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  adresse?: string;

  /**
   * Emplacement parent (module « arborescence »). null détache
   * l'emplacement : il redevient un emplacement de premier niveau.
   */
  @IsOptional()
  @IsUUID('4', { message: 'Emplacement parent invalide.' })
  parentId?: string | null;
}
