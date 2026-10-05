import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { RetoursFournisseurService } from './retours-fournisseur.service.js';
import { AvoirDto, CreerRetourFournisseurDto } from './dto/retours.dto.js';

@Controller('retours-fournisseur')
export class RetoursFournisseurController {
  constructor(private readonly service: RetoursFournisseurService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  creer(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: CreerRetourFournisseurDto,
  ) {
    return this.service.creer(entrepriseId, user.utilisateurId, dto);
  }

  @Get()
  lister(
    @CurrentTenant() entrepriseId: string,
    @Query('statut') statut?: string,
  ) {
    return this.service.lister(entrepriseId, statut || undefined);
  }

  @Patch(':id/avoir')
  avoir(
    @CurrentTenant() entrepriseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AvoirDto,
  ) {
    return this.service.changerAvoir(entrepriseId, id, dto.statut);
  }
}
