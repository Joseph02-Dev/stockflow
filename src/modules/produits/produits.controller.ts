import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { ProduitsService } from './produits.service.js';
import { CreateProduitDto } from './dto/create-produit.dto.js';
import { UpdateProduitDto } from './dto/update-produit.dto.js';

@Controller('produits')
export class ProduitsController {
  constructor(private readonly produitsService: ProduitsService) {}

  @Get()
  lister(
    @CurrentTenant() entrepriseId: string,
    @Query('search') search?: string,
    @Query('archive') archive?: string,
  ) {
    return this.produitsService.lister(entrepriseId, { search, inclureArchives: archive === 'true' });
  }

  @Post()
  creer(@CurrentTenant() entrepriseId: string, @Body() dto: CreateProduitDto) {
    return this.produitsService.creer(entrepriseId, dto);
  }

  @Patch(':id')
  modifier(@CurrentTenant() entrepriseId: string, @Param('id') id: string, @Body() dto: UpdateProduitDto) {
    return this.produitsService.modifier(entrepriseId, id, dto);
  }

  @Patch(':id/archive')
  archiver(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.produitsService.archiver(entrepriseId, id);
  }
}
