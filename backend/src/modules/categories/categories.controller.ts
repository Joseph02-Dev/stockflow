import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CategoriesService } from './categories.service.js';
import { CreateCategorieDto } from './dto/create-categorie.dto.js';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  lister(@CurrentTenant() entrepriseId: string) {
    return this.categoriesService.lister(entrepriseId);
  }

  @Roles('ADMIN')
  @Post()
  creer(@CurrentTenant() entrepriseId: string, @Body() dto: CreateCategorieDto) {
    return this.categoriesService.creer(entrepriseId, dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  modifier(@CurrentTenant() entrepriseId: string, @Param('id') id: string, @Body() dto: CreateCategorieDto) {
    return this.categoriesService.modifier(entrepriseId, id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  supprimer(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.categoriesService.supprimer(entrepriseId, id);
  }
}
