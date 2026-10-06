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
}
