import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { MarquesService } from './marques.service.js';
import { CreateMarqueDto } from './dto/create-marque.dto.js';

@Controller('marques')
export class MarquesController {
  constructor(private readonly marquesService: MarquesService) {}

  @Get()
  lister(@CurrentTenant() entrepriseId: string) {
    return this.marquesService.lister(entrepriseId);
  }

  @Roles('ADMIN')
  @Post()
  creer(@CurrentTenant() entrepriseId: string, @Body() dto: CreateMarqueDto) {
    return this.marquesService.creer(entrepriseId, dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  modifier(@CurrentTenant() entrepriseId: string, @Param('id') id: string, @Body() dto: CreateMarqueDto) {
    return this.marquesService.modifier(entrepriseId, id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  supprimer(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.marquesService.supprimer(entrepriseId, id);
  }
}
