import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { lirePagination } from '../../common/pagination/pagination.js';
import { MouvementsService } from '../mouvements/mouvements.service.js';
import { LotsService } from './lots.service.js';

@Controller()
export class LotsController {
  constructor(
    private readonly lotsService: LotsService,
    private readonly mouvementsService: MouvementsService,
  ) {}

  /** Tuiles de l'écran Péremptions et nombre de lots sous surveillance. */
  @Get('peremptions')
  resume(@CurrentTenant() entrepriseId: string) {
    return this.lotsService.resume(entrepriseId);
  }

  @Get('peremptions/lots')
  lister(
    @CurrentTenant() entrepriseId: string,
    @Query('tranche') tranche?: string,
    @Query('limite') limite?: string,
    @Query('apres') apres?: string,
  ) {
    return this.lotsService.listerPeremptions(
      entrepriseId,
      tranche || undefined,
      lirePagination(limite, apres),
    );
  }

  /** Sortie d'un lot périmé : mouvement PERIME de toute sa quantité. */
  @Post('peremptions/lots/:id/sortir')
  @HttpCode(HttpStatus.CREATED)
  sortirPerime(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) lotId: string,
  ) {
    return this.mouvementsService.sortirLotPerime(
      entrepriseId,
      user.utilisateurId,
      lotId,
    );
  }

  @Get('produits/:id/lots')
  lotsDuProduit(
    @CurrentTenant() entrepriseId: string,
    @Param('id', ParseUUIDPipe) produitId: string,
    @Query('emplacement_id') emplacementId?: string,
  ) {
    return this.lotsService.lotsDuProduit(
      entrepriseId,
      produitId,
      emplacementId || undefined,
    );
  }
}
