import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { FournisseursService } from './fournisseurs.service.js';
import { CreateFournisseurDto } from './dto/create-fournisseur.dto.js';
import { UpdateFournisseurDto } from './dto/update-fournisseur.dto.js';
import { AssocierProduitDto } from './dto/associer-produit.dto.js';

@Controller('fournisseurs')
export class FournisseursController {
  constructor(private readonly fournisseursService: FournisseursService) {}

  @Get()
  lister(@CurrentTenant() entrepriseId: string) {
    return this.fournisseursService.lister(entrepriseId);
  }

  @Get(':id')
  obtenir(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.fournisseursService.obtenir(entrepriseId, id);
  }

  @Post()
  creer(@CurrentTenant() entrepriseId: string, @Body() dto: CreateFournisseurDto) {
    return this.fournisseursService.creer(entrepriseId, dto);
  }

  @Patch(':id')
  modifier(@CurrentTenant() entrepriseId: string, @Param('id') id: string, @Body() dto: UpdateFournisseurDto) {
    return this.fournisseursService.modifier(entrepriseId, id, dto);
  }

  @Get(':id/produits')
  listerProduitsAssocies(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.fournisseursService.listerProduitsAssocies(entrepriseId, id);
  }

  @Post(':id/produits')
  associerProduit(
    @CurrentTenant() entrepriseId: string,
    @Param('id') id: string,
    @Body() dto: AssocierProduitDto,
  ) {
    return this.fournisseursService.associerProduit(entrepriseId, id, dto.produitId);
  }

  @Delete(':id/produits/:produitId')
  dissocierProduit(
    @CurrentTenant() entrepriseId: string,
    @Param('id') id: string,
    @Param('produitId') produitId: string,
  ) {
    return this.fournisseursService.dissocierProduit(entrepriseId, id, produitId);
  }
}
