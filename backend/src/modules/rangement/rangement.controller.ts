import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { ModuleRequis } from '../../common/decorators/module-requis.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CreerRegleRangementDto } from './dto/regle-rangement.dto.js';
import { RangementService } from './rangement.service.js';

@ModuleRequis('rangement')
@Controller('rangement')
export class RangementController {
  constructor(private readonly service: RangementService) {}

  @Get('regles')
  lister(@CurrentTenant() entrepriseId: string) {
    return this.service.lister(entrepriseId);
  }

  @Roles('ADMIN')
  @Post('regles')
  creer(@CurrentTenant() entrepriseId: string, @Body() dto: CreerRegleRangementDto) {
    return this.service.creer(entrepriseId, dto);
  }

  @Roles('ADMIN')
  @Delete('regles/:id')
  supprimer(@CurrentTenant() entrepriseId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.supprimer(entrepriseId, id);
  }

  /** Où ranger ce produit arrivant à cet emplacement : { emplacement } ou { emplacement: null }. */
  @Get('proposition')
  async proposition(
    @CurrentTenant() entrepriseId: string,
    @Query('produit_id') produitId?: string,
    @Query('emplacement_id') emplacementId?: string,
  ) {
    if (!produitId || !emplacementId) throw new BadRequestException('Indiquez produit_id et emplacement_id.');
    return { emplacement: await this.service.proposer(entrepriseId, produitId, emplacementId) };
  }
}
