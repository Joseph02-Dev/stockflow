import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Fonctionnalite } from '../../common/decorators/fonctionnalite.decorator.js';
import { ModuleRequis } from '../../common/decorators/module-requis.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { CreerRegleReapproDto, ModifierRegleReapproDto } from './dto/regle-reappro.dto.js';
import { ReapprovisionnementService } from './reapprovisionnement.service.js';

@ModuleRequis('reapprovisionnement')
@Fonctionnalite('reapprovisionnement')
@Controller('reapprovisionnement')
export class ReapprovisionnementController {
  constructor(private readonly service: ReapprovisionnementService) {}

  @Get('regles')
  lister(@CurrentTenant() entrepriseId: string) {
    return this.service.lister(entrepriseId);
  }

  @Roles('ADMIN')
  @Post('regles')
  creer(@CurrentTenant() entrepriseId: string, @Body() dto: CreerRegleReapproDto) {
    return this.service.creer(entrepriseId, dto);
  }

  @Roles('ADMIN')
  @Patch('regles/:id')
  modifier(
    @CurrentTenant() entrepriseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModifierRegleReapproDto,
  ) {
    return this.service.modifier(entrepriseId, id, dto);
  }

  @Roles('ADMIN')
  @Delete('regles/:id')
  supprimer(@CurrentTenant() entrepriseId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.supprimer(entrepriseId, id);
  }

  /** Calcul immédiat (le même que le calcul quotidien) : renvoie les brouillons créés. */
  @Post('lancer')
  @HttpCode(HttpStatus.OK)
  lancer(@CurrentTenant() entrepriseId: string, @CurrentUser() user: RequestContext) {
    return this.service.lancer(entrepriseId, user.utilisateurId);
  }
}
