import { IsIn } from 'class-validator';

export class UpdateRoleDto {
  @IsIn(['ADMIN', 'GESTIONNAIRE'], { message: 'Le rôle doit être ADMIN ou GESTIONNAIRE.' })
  role!: 'ADMIN' | 'GESTIONNAIRE';
}
