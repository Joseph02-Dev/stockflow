import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ConsoleAuthService } from './console-auth.service.js';
import { LoginConsoleDto } from './dto/login-console.dto.js';
import { ConsolePublique, OperateurCourant, RouteConsole } from './securite/console.decorators.js';
import type { OperateurConnecte } from './securite/console.decorators.js';
import { LIMITES_STRICTES, LimiteStricte } from '../../common/limitation/limitation.js';

@RouteConsole()
@Controller('console/auth')
export class ConsoleAuthController {
  constructor(private readonly consoleAuthService: ConsoleAuthService) {}

  @ConsolePublique()
  @LimiteStricte(LIMITES_STRICTES.connexionConsole)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginConsoleDto) {
    return this.consoleAuthService.login(dto);
  }

  /** Vérifie la session côté frontend (token encore valide, opérateur existant). */
  @Get('moi')
  moi(@OperateurCourant() operateur: OperateurConnecte) {
    return operateur;
  }
}
