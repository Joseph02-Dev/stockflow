import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { InventairesService } from './inventaires.service.js';
import { CreateInventaireDto } from './dto/create-inventaire.dto.js';
import { SaisirComptageDto } from './dto/saisir-comptage.dto.js';

@Controller('inventaires')
export class InventairesController {
  constructor(private readonly inventairesService: InventairesService) {}

  @Post()
  creer(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: CreateInventaireDto,
  ) {
    return this.inventairesService.creer(entrepriseId, user.utilisateurId, dto);
  }

  @Get()
  lister(
    @CurrentTenant() entrepriseId: string,
    @Query('emplacement_id') emplacementId?: string,
    @Query('statut') statut?: 'EN_COURS' | 'TERMINE',
  ) {
    return this.inventairesService.lister(entrepriseId, { emplacementId, statut });
  }

  @Get(':id')
  obtenir(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.inventairesService.obtenir(entrepriseId, id);
  }

  @Patch(':id/lignes/:ligneId')
  saisirComptage(
    @CurrentTenant() entrepriseId: string,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
    @Body() dto: SaisirComptageDto,
  ) {
    return this.inventairesService.saisirComptage(entrepriseId, id, ligneId, dto);
  }

  @Post(':id/terminer')
  terminer(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.inventairesService.terminer(entrepriseId, id);
  }

  @Post(':id/lignes/:ligneId/valider')
  validerLigne(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Param('ligneId') ligneId: string,
  ) {
    return this.inventairesService.validerLigne(entrepriseId, user.utilisateurId, id, ligneId);
  }

  @Post(':id/lignes/:ligneId/ignorer')
  ignorerLigne(@CurrentTenant() entrepriseId: string, @Param('id') id: string, @Param('ligneId') ligneId: string) {
    return this.inventairesService.ignorerLigne(entrepriseId, id, ligneId);
  }
}
