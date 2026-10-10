import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { AuthService, type AuthResult, type DetailsInvitation } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { AcceptInviteDto, DetailsInvitationDto } from './dto/accept-invite.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { LIMITES_STRICTES, LimiteStricte } from '../../common/limitation/limitation.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @LimiteStricte(LIMITES_STRICTES.inscription)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto): Promise<{ message: string }> {
    return this.authService.register(dto);
  }

  @Public()
  @LimiteStricte(LIMITES_STRICTES.connexion)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<AuthResult> {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @LimiteStricte(LIMITES_STRICTES.renvoiVerification)
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() dto: ResendVerificationDto): Promise<{ message: string }> {
    return this.authService.resendVerification(dto);
  }

  @Public()
  @LimiteStricte(LIMITES_STRICTES.motDePasseOublie)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @LimiteStricte(LIMITES_STRICTES.reinitialisation)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto);
  }

  // Lecture seule, avant l'inscription : même limite que l'acceptation
  // (le jeton est long et aléatoire, la limite freine les essais au hasard).
  @Public()
  @LimiteStricte(LIMITES_STRICTES.acceptationInvitation)
  @Get('invitation')
  detailsInvitation(@Query() dto: DetailsInvitationDto): Promise<DetailsInvitation> {
    return this.authService.detailsInvitation(dto.token);
  }

  @Public()
  @LimiteStricte(LIMITES_STRICTES.acceptationInvitation)
  @Post('accept-invite')
  @HttpCode(HttpStatus.CREATED)
  acceptInvite(@Body() dto: AcceptInviteDto): Promise<AuthResult> {
    return this.authService.acceptInvite(dto);
  }

  // Publique : l'access token est justement expiré quand on l'appelle.
  // Le refresh token du corps fait office de preuve d'identité.
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<AuthResult> {
    return this.authService.refresh(dto);
  }

  // Route protégée (pas de @Public()) : nécessite un access token valide
  // pour identifier l'utilisateur qui se déconnecte.
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentUser() user: RequestContext, @Body() dto: LogoutDto): Promise<{ message: string }> {
    return this.authService.logout(user.utilisateurId, dto);
  }
}
