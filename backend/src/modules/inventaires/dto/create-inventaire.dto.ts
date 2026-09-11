import { IsUUID } from 'class-validator';

export class CreateInventaireDto {
  @IsUUID('4', { message: 'emplacementId doit être un identifiant valide.' })
  emplacementId!: string;
}
