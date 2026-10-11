import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { Fonctionnalite } from '../../common/decorators/fonctionnalite.decorator.js';
import { ModuleRequis } from '../../common/decorators/module-requis.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CreerAbonnementDto, ModifierAbonnementDto } from './dto/abonnement.dto.js';
import { WebhooksService } from './webhooks.service.js';

/** Intégrations sortantes : réservées à l'administrateur. */
@Roles('ADMIN')
@ModuleRequis('webhooks')
@Fonctionnalite('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Get()
  lister(@CurrentTenant() entrepriseId: string) {
    return this.service.lister(entrepriseId);
  }

  /** Renvoie le secret de signature — une seule fois. */
  @Post()
  creer(@CurrentTenant() entrepriseId: string, @Body() dto: CreerAbonnementDto) {
    return this.service.creer(entrepriseId, dto);
  }

  @Patch(':id')
  modifier(@CurrentTenant() entrepriseId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModifierAbonnementDto) {
    return this.service.modifier(entrepriseId, id, dto);
  }

  @Delete(':id')
  supprimer(@CurrentTenant() entrepriseId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.supprimer(entrepriseId, id);
  }

  @Get(':id/livraisons')
  livraisons(@CurrentTenant() entrepriseId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.livraisons(entrepriseId, id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.ACCEPTED)
  tester(@CurrentTenant() entrepriseId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.tester(entrepriseId, id);
  }
}
