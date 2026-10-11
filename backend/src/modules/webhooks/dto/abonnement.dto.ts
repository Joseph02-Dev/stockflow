import { ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { EVENEMENTS_WEBHOOK } from '../regles-webhook.js';

const MESSAGE_EVENEMENTS = `Événements possibles : ${EVENEMENTS_WEBHOOK.join(', ')}.`;

export class CreerAbonnementDto {
  /** URL https qui recevra un POST JSON signé à chaque événement. */
  @IsString()
  @MaxLength(500)
  url!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Choisissez au moins un événement.' })
  @ArrayUnique()
  @IsIn(EVENEMENTS_WEBHOOK, { each: true, message: MESSAGE_EVENEMENTS })
  evenements!: string[];
}

export class ModifierAbonnementDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Choisissez au moins un événement.' })
  @ArrayUnique()
  @IsIn(EVENEMENTS_WEBHOOK, { each: true, message: MESSAGE_EVENEMENTS })
  evenements?: string[];

  /** Réactiver remet le compteur d'échecs à zéro. */
  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}
