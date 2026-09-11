import { IsInt, Min } from 'class-validator';

export class SaisirComptageDto {
  @IsInt({ message: 'La quantité comptée doit être un nombre entier.' })
  @Min(0, { message: 'La quantité comptée ne peut pas être négative.' })
  quantiteComptee!: number;
}
