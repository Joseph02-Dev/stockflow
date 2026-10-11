import { Controller, Get, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { StatistiquesService } from './statistiques.service.js';
import { RotationService } from './rotation.service.js';
import { RotationQueryDto } from './dto/rotation.dto.js';
import { ModuleRequis } from '../../common/decorators/module-requis.decorator.js';
import {
  StatistiquesQueryDto,
  StockHebdoQueryDto,
} from './dto/statistiques.dto.js';

@Controller('statistiques')
export class StatistiquesController {
  constructor(
    private readonly statistiques: StatistiquesService,
    private readonly rotation: RotationService,
  ) {}

  /** Rotation et stock dormant sur la période (module « rotation »). */
  @ModuleRequis('rotation')
  @Get('rotation')
  rapportRotation(@CurrentTenant() entrepriseId: string, @Query() query: RotationQueryDto) {
    return this.rotation.rapport(entrepriseId, query.jours ?? 90);
  }

  @Get()
  resume(
    @CurrentTenant() entrepriseId: string,
    @Query() query: StatistiquesQueryDto,
  ) {
    return this.statistiques.resume(entrepriseId, query.periode ?? '30j');
  }

  @Get('stock-hebdo')
  stockHebdomadaire(
    @CurrentTenant() entrepriseId: string,
    @Query() query: StockHebdoQueryDto,
  ) {
    return this.statistiques.stockHebdomadaire(entrepriseId, query.produitId);
  }
}
