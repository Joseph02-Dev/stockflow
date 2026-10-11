import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, Length, ValidateNested } from 'class-validator';

/** Taille de la conversation renvoyée par le navigateur : borne le coût de chaque question. */
export const MESSAGES_MAX = 10;
export const LONGUEUR_MESSAGE_MAX = 2000;

export class MessageChatDto {
  @IsIn(['user', 'assistant'], { message: 'role doit valoir user ou assistant.' })
  role!: 'user' | 'assistant';

  @IsString()
  @Length(1, LONGUEUR_MESSAGE_MAX, { message: `Un message compte de 1 à ${LONGUEUR_MESSAGE_MAX} caractères.` })
  contenu!: string;
}

/**
 * Historique en texte seul : aucun bloc d'outil n'est accepté du
 * navigateur, qui ne peut donc pas fabriquer un faux résultat d'outil.
 */
export class ChatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MESSAGES_MAX, { message: `La conversation est limitée aux ${MESSAGES_MAX} derniers messages.` })
  @ValidateNested({ each: true })
  @Type(() => MessageChatDto)
  messages!: MessageChatDto[];
}
