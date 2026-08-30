import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { AlertesService } from './alertes.service.js';

@Controller('alertes')
export class AlertesController {
  constructor(private readonly alertesService: AlertesService) {}

  @Get()
  lister(@CurrentTenant() entrepriseId: string, @Query('statut') statut?: string) {
    if (statut && statut !== 'ACTIVE' && statut !== 'RESOLUE') {
      throw new BadRequestException('Le statut doit être ACTIVE ou RESOLUE.');
    }
    return this.alertesService.lister(entrepriseId, statut as 'ACTIVE' | 'RESOLUE' | undefined);
  }
}
