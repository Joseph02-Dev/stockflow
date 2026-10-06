import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { PeriodeDto, RapportMouvementsDto, RapportPeriodeDto, RapportStockDto } from './dto/rapports.dto.js';
import { RapportPertesService } from './rapport-pertes.service.js';
import { RapportClientService } from './rapport-client.service.js';
import { RapportMouvementsService } from './rapport-mouvements.service.js';
import { RapportStockService } from './rapport-stock.service.js';
import { compterPages, type RapportGenere } from './rapports.types.js';
import { Fonctionnalite } from '../../common/decorators/fonctionnalite.decorator.js';

/**
 * Rapports PDF (et CSV) générés côté serveur : identiques quel que soit le
 * poste qui les produit. Le document est téléchargé, jamais hébergé : un
 * relevé de compte porte des données personnelles et des dettes.
 */
@Fonctionnalite('rapports')
@Controller('rapports')
export class RapportsController {
  constructor(
    private readonly stock: RapportStockService,
    private readonly mouvements: RapportMouvementsService,
    private readonly client: RapportClientService,
    private readonly pertes: RapportPertesService,
  ) {}

  @Get('stock')
  async etatDuStock(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Query() dto: RapportStockDto,
    @Res() res: Response,
  ) {
    await envoyer(res, dto.format, await this.stock.generer(entrepriseId, user.utilisateurId, dto));
  }

  @Get('mouvements')
  async journalDesMouvements(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Query() dto: RapportMouvementsDto,
    @Res() res: Response,
  ) {
    await envoyer(res, dto.format, await this.mouvements.generer(entrepriseId, user.utilisateurId, dto));
  }

  /** Relevé de compte : client d'une autre entreprise → 404, jamais le document. */
  @Get('client/:id')
  async releveClient(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: PeriodeDto,
    @Res() res: Response,
  ) {
    await envoyer(res, dto.format, await this.client.generer(entrepriseId, user.utilisateurId, id, dto));
  }

  @Get('pertes')
  async rapportDePertes(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Query() dto: RapportPeriodeDto,
    @Res() res: Response,
  ) {
    await envoyer(res, dto.format, await this.pertes.generer(entrepriseId, user.utilisateurId, dto));
  }
}

async function envoyer(res: Response, format: 'pdf' | 'csv', rapport: RapportGenere) {
  // Données d'entreprise : jamais mises en cache par un intermédiaire.
  res.setHeader('Cache-Control', 'no-store');
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${rapport.nomFichier}.csv"`);
    res.send(rapport.csv());
    return;
  }
  const pdf = await rapport.pdf();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${rapport.nomFichier}.pdf"`);
  res.setHeader('X-Nombre-Pages', String(compterPages(pdf)));
  res.send(pdf);
}
