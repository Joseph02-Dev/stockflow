import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
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
import { effacerCookieSession, lireCookieSession, repondreAvecSession } from './cookie-session.js';

/** Réponse d'ouverture de session : le refresh token part dans le cookie httpOnly. */
type SessionOuverte = Omit<AuthResult, 'refreshToken'>;

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
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<SessionOuverte> {
    return repondreAvecSession(res, await this.authService.login(dto), dto.resterConnecte ?? true);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto, @Res({ passthrough: true }) res: Response): Promise<SessionOuverte> {
    return repondreAvecSession(res, await this.authService.verifyEmail(dto));
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
  async acceptInvite(@Body() dto: AcceptInviteDto, @Res({ passthrough: true }) res: Response): Promise<SessionOuverte> {
    return repondreAvecSession(res, await this.authService.acceptInvite(dto));
  }

  // Publique : l'access token est justement expiré (ou perdu au
  // rechargement de la page) quand on l'appelle. Le refresh token du
  // cookie fait office de preuve d'identité.
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionOuverte> {
    try {
      const resultat = await this.authService.refresh(lireCookieSession(req) ?? dto.refreshToken);
      return repondreAvecSession(res, resultat, dto.resterConnecte ?? true);
    } catch (erreur) {
      // Session invalide : cookie effacé. Une entreprise suspendue (403)
      // garde le sien, la session reprend si l'accès est rétabli.
      if (erreur instanceof UnauthorizedException) effacerCookieSession(res);
      throw erreur;
    }
  }

  // Route protégée (pas de @Public()) : nécessite un access token valide
  // pour identifier l'utilisateur qui se déconnecte.
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @CurrentUser() user: RequestContext,
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    effacerCookieSession(res);
    return this.authService.logout(user.utilisateurId, lireCookieSession(req) ?? dto.refreshToken);
  }
}
