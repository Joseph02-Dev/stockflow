import { IsEmail, IsIn } from 'class-validator';

export class InviteUserDto {
  @IsEmail({}, { message: 'Adresse email invalide.' })
  email!: string;

  @IsIn(['ADMIN', 'GESTIONNAIRE'], { message: 'Le rôle doit être ADMIN ou GESTIONNAIRE.' })
  role!: 'ADMIN' | 'GESTIONNAIRE';
}
