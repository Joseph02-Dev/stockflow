import { Controller, Get, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { SynchroniserDto } from './dto/synchroniser.dto.js';
import { SynchronisationService } from './synchronisation.service.js';

@Controller('sync')
export class SynchronisationController {
  constructor(private readonly synchronisation: SynchronisationService) {}

  /** Ce qui a changé depuis le curseur, pour la base locale de l'appareil (ADR 0001). */
  @Get()
  synchroniser(@CurrentTenant() entrepriseId: string, @Query() dto: SynchroniserDto) {
    return this.synchronisation.synchroniser(entrepriseId, dto.depuis);
  }
}
