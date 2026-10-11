import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { lirePagination } from '../../common/pagination/pagination.js';
import { CreerMouvementDto } from './dto/creer-mouvement.dto.js';
import { StockService } from './stock.service.js';

/** API du moteur de stock en double entrée (voir StockService). */
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  /** Emplacements réels (avec leur chemin) et emplacements virtuels. */
  @Get('emplacements')
  emplacements(@CurrentTenant() entrepriseId: string) {
    return this.stockService.emplacements(entrepriseId);
  }

  @Get('quantites')
  quantites(
    @CurrentTenant() entrepriseId: string,
    @Query('produit_id') produitId?: string,
    @Query('emplacement_id') emplacementId?: string,
  ) {
    return this.stockService.quantites(entrepriseId, { produitId, emplacementId });
  }

  @Get('mouvements')
  mouvements(
    @CurrentTenant() entrepriseId: string,
    @Query('produit_id') produitId?: string,
    @Query('emplacement_id') emplacementId?: string,
    @Query('limite') limite?: string,
    @Query('apres') apres?: string,
  ) {
    return this.stockService.mouvements(entrepriseId, { produitId, emplacementId }, lirePagination(limite, apres));
  }

  @Post('mouvements')
  @HttpCode(HttpStatus.CREATED)
  creerMouvement(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: CreerMouvementDto,
  ) {
    return this.stockService.creerMouvement(entrepriseId, user.utilisateurId, dto);
  }
}
