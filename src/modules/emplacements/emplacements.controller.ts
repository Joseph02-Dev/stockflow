import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { EmplacementsService } from './emplacements.service.js';
import { CreateEmplacementDto } from './dto/create-emplacement.dto.js';
import { UpdateEmplacementDto } from './dto/update-emplacement.dto.js';

@Controller('emplacements')
export class EmplacementsController {
  constructor(private readonly emplacementsService: EmplacementsService) {}

  @Get()
  lister(@CurrentTenant() entrepriseId: string, @Query('archive') archive?: string) {
    return this.emplacementsService.lister(entrepriseId, archive === 'true');
  }

  @Roles('ADMIN')
  @Post()
  creer(@CurrentTenant() entrepriseId: string, @Body() dto: CreateEmplacementDto) {
    return this.emplacementsService.creer(entrepriseId, dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  modifier(
    @CurrentTenant() entrepriseId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEmplacementDto,
  ) {
    return this.emplacementsService.modifier(entrepriseId, id, dto);
  }

  @Roles('ADMIN')
  @Patch(':id/archive')
  archiver(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.emplacementsService.archiver(entrepriseId, id);
  }
}
