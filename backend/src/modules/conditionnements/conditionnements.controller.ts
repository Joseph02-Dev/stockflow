import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { ModuleRequis } from '../../common/decorators/module-requis.decorator.js';
import { ConditionnementsService } from './conditionnements.service.js';
import { CreerConditionnementDto, ModifierConditionnementDto } from './dto/conditionnement.dto.js';

@ModuleRequis('conditionnements')
@Controller()
export class ConditionnementsController {
  constructor(private readonly conditionnementsService: ConditionnementsService) {}

  @Get('produits/:produitId/conditionnements')
  lister(@CurrentTenant() entrepriseId: string, @Param('produitId', ParseUUIDPipe) produitId: string) {
    return this.conditionnementsService.lister(entrepriseId, produitId);
  }

  @Post('produits/:produitId/conditionnements')
  creer(
    @CurrentTenant() entrepriseId: string,
    @Param('produitId', ParseUUIDPipe) produitId: string,
    @Body() dto: CreerConditionnementDto,
  ) {
    return this.conditionnementsService.creer(entrepriseId, produitId, dto);
  }

  @Patch('conditionnements/:id')
  modifier(
    @CurrentTenant() entrepriseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModifierConditionnementDto,
  ) {
    return this.conditionnementsService.modifier(entrepriseId, id, dto);
  }

  @Patch('conditionnements/:id/archive')
  archiver(@CurrentTenant() entrepriseId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.conditionnementsService.archiver(entrepriseId, id);
  }
}
