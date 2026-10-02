import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ConsoleEntreprisesService } from './console-entreprises.service.js';
import { ConsoleSuspensionService } from './console-suspension.service.js';
import { RetablirDto, SuspendreDto } from './dto/suspension.dto.js';
import { ListeEntreprisesDto } from './dto/liste-entreprises.dto.js';
import { PaginationDto } from './dto/pagination.dto.js';
import { OperateurCourant, RouteConsole } from './securite/console.decorators.js';
import type { OperateurConnecte } from './securite/console.decorators.js';

/**
 * Consultation (lecture seule) et suspension des entreprises. Aucune
 * route de ce controller ne crée, ne modifie ni ne supprime une donnée
 * métier : seuls le statut d'accès, les sessions et le journal changent.
 */
@RouteConsole()
@Controller('console')
export class ConsoleEntreprisesController {
  constructor(
    private readonly service: ConsoleEntreprisesService,
    private readonly suspension: ConsoleSuspensionService,
  ) {}

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

  @Post('entreprises/:id/suspendre')
  @HttpCode(HttpStatus.OK)
  suspendre(
    @OperateurCourant() operateur: OperateurConnecte,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendreDto,
  ) {
    return this.suspension.suspendre(operateur.id, id, dto.motif);
  }

  @Post('entreprises/:id/retablir')
  @HttpCode(HttpStatus.OK)
  retablir(
    @OperateurCourant() operateur: OperateurConnecte,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RetablirDto,
  ) {
    return this.suspension.retablir(operateur.id, id, dto.motif);
  }
}
