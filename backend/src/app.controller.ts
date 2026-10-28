import { Controller, Get } from '@nestjs/common';
import { AppService, type EtatSante } from './app.service.js';
import { Public } from './common/decorators/public.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Healthcheck (Railway, supervision) : 200 si l'API peut joindre sa base,
   * 503 sinon. Railway n'active un nouveau déploiement qu'après un 2xx ici.
   */
  @Public()
  @Get('health')
  sante(): Promise<EtatSante> {
    return this.appService.sante();
  }

  /**
   * Sonde de disponibilité externe (toutes les 5 min) : l'API répond, sans
   * toucher la base, pour que Neon puisse se mettre en veille entre deux
   * vraies requêtes. La base se vérifie sur /health.
   */
  @Public()
  @Get('health/vivant')
  vivant(): { statut: 'ok' } {
    return { statut: 'ok' };
  }
}
