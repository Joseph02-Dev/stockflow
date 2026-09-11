import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { CommandesService } from './commandes.service.js';
import { CreateCommandeDto } from './dto/create-commande.dto.js';
import { UpdateCommandeDto } from './dto/update-commande.dto.js';

@Controller('commandes')
export class CommandesController {
  constructor(private readonly commandesService: CommandesService) {}

  @Post()
  creer(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: CreateCommandeDto,
  ) {
    return this.commandesService.creer(entrepriseId, user.utilisateurId, dto);
  }

  @Get()
  lister(
    @CurrentTenant() entrepriseId: string,
    @Query('fournisseur_id') fournisseurId?: string,
    @Query('statut') statut?: string,
  ) {
    return this.commandesService.lister(entrepriseId, { fournisseurId, statut });
  }

  @Get(':id')
  obtenir(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.commandesService.obtenir(entrepriseId, id);
  }

  @Patch(':id')
  modifier(@CurrentTenant() entrepriseId: string, @Param('id') id: string, @Body() dto: UpdateCommandeDto) {
    return this.commandesService.modifier(entrepriseId, id, dto);
  }

  @Post(':id/envoyer')
  envoyer(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.commandesService.envoyer(entrepriseId, id);
  }

  @Post(':id/recevoir')
  recevoir(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
  ) {
    return this.commandesService.recevoir(entrepriseId, user.utilisateurId, id);
  }

  @Post(':id/annuler')
  annuler(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.commandesService.annuler(entrepriseId, id);
  }
}
