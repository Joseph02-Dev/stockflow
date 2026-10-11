import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { ModuleRequis } from '../../common/decorators/module-requis.decorator.js';
import { ValorisationService } from './valorisation.service.js';

@ModuleRequis('valorisation')
@Controller('valorisation')
export class ValorisationController {
  constructor(private readonly service: ValorisationService) {}

  /** Valeur du stock par produit et au total, selon la méthode choisie. */
  @Get()
  resume(@CurrentTenant() entrepriseId: string) {
    return this.service.resume(entrepriseId);
  }

  @Get('produits/:id/couches')
  couches(@CurrentTenant() entrepriseId: string, @Param('id', ParseUUIDPipe) produitId: string) {
    return this.service.couches(entrepriseId, produitId);
  }
}
