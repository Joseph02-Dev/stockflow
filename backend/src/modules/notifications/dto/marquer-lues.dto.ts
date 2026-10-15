import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Matches } from 'class-validator';

export class MarquerLuesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Matches(/^(alerte|lot):[0-9a-f-]{36}:[A-Z0-9_]{1,20}$/, {
    each: true,
    message: 'Clé de notification invalide.',
  })
  cles!: string[];
}
