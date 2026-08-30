import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { MouvementsService } from './mouvements.service.js';
import { EntreeStockDto } from './dto/entree-stock.dto.js';
import { SortieStockDto } from './dto/sortie-stock.dto.js';

@Controller()
export class MouvementsController {
  constructor(private readonly mouvementsService: MouvementsService) {}

  @Post('mouvements/entree')
  @HttpCode(HttpStatus.CREATED)
  entree(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: EntreeStockDto,
  ) {
    return this.mouvementsService.entree(entrepriseId, user.utilisateurId, dto);
  }

  @Post('mouvements/sortie')
  @HttpCode(HttpStatus.CREATED)
  sortie(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: SortieStockDto,
  ) {
    return this.mouvementsService.sortie(entrepriseId, user.utilisateurId, dto);
  }

  @Get('mouvements')
  listerMouvements(
    @CurrentTenant() entrepriseId: string,
    @Query('produit_id') produitId?: string,
    @Query('emplacement_id') emplacementId?: string,
  ) {
    return this.mouvementsService.listerMouvements(entrepriseId, { produitId, emplacementId });
  }

  @Get('stock')
  listerStock(
    @CurrentTenant() entrepriseId: string,
    @Query('produit_id') produitId?: string,
    @Query('emplacement_id') emplacementId?: string,
  ) {
    return this.mouvementsService.listerStock(entrepriseId, { produitId, emplacementId });
  }
}
