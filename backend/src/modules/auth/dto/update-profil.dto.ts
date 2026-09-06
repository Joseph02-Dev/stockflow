import { IsUrl } from 'class-validator';

export class UpdateProfilDto {
  @IsUrl({}, { message: 'photoUrl doit être une URL valide.' })
  photoUrl!: string;
}
