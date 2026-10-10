import { Controller, Get, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { StatistiquesService } from './statistiques.service.js';
import {
  StatistiquesQueryDto,
  StockHebdoQueryDto,
} from './dto/statistiques.dto.js';

@Controller('statistiques')
export class StatistiquesController {
  constructor(private readonly statistiques: StatistiquesService) {}

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
