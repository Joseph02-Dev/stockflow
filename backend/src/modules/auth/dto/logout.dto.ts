import { IsOptional, IsString, MinLength } from 'class-validator';

export class LogoutDto {
  /** Transition seulement (voir RefreshDto) : le cookie l'emporte toujours. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  refreshToken?: string;
}
