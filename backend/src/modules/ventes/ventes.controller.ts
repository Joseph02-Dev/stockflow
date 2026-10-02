import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { VentesService } from './ventes.service.js';
import { CreancesService } from './creances.service.js';
import { CreerVenteDto } from './dto/creer-vente.dto.js';
import { ReglementDto } from './dto/reglement.dto.js';
import { AnnulerVenteDto } from './dto/annuler-vente.dto.js';
import { ListerVentesDto } from './dto/lister-ventes.dto.js';

@Controller('ventes')
export class VentesController {
  constructor(private readonly ventesService: VentesService) {}

  @Post()
  creer(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() utilisateur: RequestContext,
    @Body() dto: CreerVenteDto,
  ) {
    return this.ventesService.creer(
      entrepriseId,
      utilisateur.utilisateurId,
      dto,
    );
  }

  @Get()
  lister(
    @CurrentTenant() entrepriseId: string,
    @Query() filtres: ListerVentesDto,
  ) {
    return this.ventesService.lister(entrepriseId, filtres);
  }

  @Get(':id')
  obtenir(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.ventesService.obtenir(entrepriseId, id);
  }

  @Post(':id/annuler')
  annuler(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() utilisateur: RequestContext,
    @Param('id') id: string,
    @Body() dto: AnnulerVenteDto,
  ) {
    return this.ventesService.annuler(
      entrepriseId,
      utilisateur.utilisateurId,
      id,
      dto.motif,
    );
  }

  @Post(':id/reglements')
  regler(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() utilisateur: RequestContext,
    @Param('id') id: string,
    @Body() dto: ReglementDto,
  ) {
    return this.ventesService.reglerVente(
      entrepriseId,
      utilisateur.utilisateurId,
      id,
      dto,
    );
  }
}

/** Vues « ventes » d'un client : situation, historique et encaissement. */
@Controller('clients')
export class ClientsVentesController {
  constructor(
    private readonly ventesService: VentesService,
    private readonly creancesService: CreancesService,
  ) {}

  /** Encaissement réparti sur les ventes non soldées, la plus ancienne d'abord. */
  @Post(':id/reglements')
  encaisser(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() utilisateur: RequestContext,
    @Param('id') id: string,
    @Body() dto: ReglementDto,
  ) {
    return this.creancesService.encaisser(
      entrepriseId,
      utilisateur.utilisateurId,
      id,
      dto,
    );
  }

  @Get(':id/situation')
  situation(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.ventesService.situationClient(entrepriseId, id);
  }

  @Get(':id/historique')
  historique(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.ventesService.historiqueClient(entrepriseId, id);
  }
}

@Controller('creances')
export class CreancesController {
  constructor(private readonly creancesService: CreancesService) {}

  @Get()
  lister(@CurrentTenant() entrepriseId: string) {
    return this.creancesService.lister(entrepriseId);
  }
}
