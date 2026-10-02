import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { ClientsService } from './clients.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  lister(
    @CurrentTenant() entrepriseId: string,
    @Query('search') search?: string,
    @Query('archive') archive?: string,
  ) {
    return this.clientsService.lister(entrepriseId, { search, inclureArchives: archive === 'true' });
  }

  @Get(':id')
  obtenir(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.clientsService.obtenir(entrepriseId, id);
  }

  @Post()
  creer(@CurrentTenant() entrepriseId: string, @Body() dto: CreateClientDto) {
    return this.clientsService.creer(entrepriseId, dto);
  }

  @Patch(':id')
  modifier(@CurrentTenant() entrepriseId: string, @Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.modifier(entrepriseId, id, dto);
  }

  @Patch(':id/archive')
  archiver(@CurrentTenant() entrepriseId: string, @Param('id') id: string) {
    return this.clientsService.archiver(entrepriseId, id);
  }
}
