import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { ModuleRequis } from '../../common/decorators/module-requis.decorator.js';
import { CreerModeleDto, ModifierModeleDto } from './dto/modele.dto.js';
import { ModelesService } from './modeles.service.js';

@ModuleRequis('variantes')
@Controller('modeles')
export class ModelesController {
  constructor(private readonly modelesService: ModelesService) {}

  @Get()
  lister(@CurrentTenant() entrepriseId: string, @Query('archive') archive?: string) {
    return this.modelesService.lister(entrepriseId, archive === 'true');
  }

  @Get(':id')
  obtenir(@CurrentTenant() entrepriseId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.modelesService.obtenir(entrepriseId, id);
  }

  @Post()
  creer(@CurrentTenant() entrepriseId: string, @Body() dto: CreerModeleDto) {
    return this.modelesService.creer(entrepriseId, dto);
  }

  @Patch(':id')
  modifier(
    @CurrentTenant() entrepriseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModifierModeleDto,
  ) {
    return this.modelesService.modifier(entrepriseId, id, dto);
  }

  @Patch(':id/archive')
  archiver(@CurrentTenant() entrepriseId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.modelesService.archiver(entrepriseId, id);
  }
}
