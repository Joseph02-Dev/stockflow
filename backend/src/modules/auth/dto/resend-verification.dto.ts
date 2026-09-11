import { IsEmail } from 'class-validator';

export class ResendVerificationDto {
  @IsEmail({}, { message: 'Adresse email invalide.' })
  email!: string;
}
