import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ConsoleEntreprisesService } from './console-entreprises.service.js';
import { ListeEntreprisesDto } from './dto/liste-entreprises.dto.js';
import { PaginationDto } from './dto/pagination.dto.js';
import { OperateurCourant, RouteConsole } from './securite/console.decorators.js';
import type { OperateurConnecte } from './securite/console.decorators.js';

/**
 * Consultation des entreprises — lecture seule. Aucune route de ce
 * controller ne crée, ne modifie ni ne supprime une donnée métier ; seul
 * le journal d'audit est écrit.
 */
@RouteConsole()
@Controller('console')
export class ConsoleEntreprisesController {
  constructor(private readonly service: ConsoleEntreprisesService) {}

  @Get('apercu')
  apercu(@OperateurCourant() operateur: OperateurConnecte) {
    return this.service.apercu(operateur.id);
  }

  @Get('entreprises')
  lister(@OperateurCourant() operateur: OperateurConnecte, @Query() filtres: ListeEntreprisesDto) {
    return this.service.lister(operateur.id, filtres);
  }

  @Get('entreprises/:id')
  fiche(@OperateurCourant() operateur: OperateurConnecte, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.fiche(operateur.id, id);
  }

  @Get('entreprises/:id/stock')
  stock(
    @OperateurCourant() operateur: OperateurConnecte,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.stock(operateur.id, id, pagination);
  }

  @Get('entreprises/:id/mouvements')
  mouvements(
    @OperateurCourant() operateur: OperateurConnecte,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.mouvements(operateur.id, id, pagination);
  }
}
