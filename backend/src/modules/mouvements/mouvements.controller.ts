import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { MouvementsService } from './mouvements.service.js';
import { EntreeStockDto } from './dto/entree-stock.dto.js';
import { SortieStockDto } from './dto/sortie-stock.dto.js';
import { TransfertStockDto } from './dto/transfert-stock.dto.js';
import { ModuleRequis } from '../../common/decorators/module-requis.decorator.js';
import { lirePagination } from '../../common/pagination/pagination.js';
import { BOM_UTF8 } from '../../common/pagination/csv.js';
import type { Response } from 'express';
import { TypeMouvement } from '../../generated/prisma/enums.js';

/**
 * `type=ENTREE,SORTIE` → liste de types validée ; absent ou vide → aucun
 * filtre. Plusieurs types à la fois : l'interface regroupe par familles
 * (« Pertes » = PERIME + CASSE).
 */
function lireTypes(valeur?: string): TypeMouvement[] | undefined {
  const types = (valeur ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (types.length === 0) return undefined;
  const inconnus = types.filter(
    (t) => !Object.values(TypeMouvement).includes(t as TypeMouvement),
  );
  if (inconnus.length > 0) {
    throw new BadRequestException(
      `Type de mouvement inconnu : ${inconnus.join(', ')}.`,
    );
  }
  return types as TypeMouvement[];
}

@Controller()
export class MouvementsController {
  constructor(private readonly mouvementsService: MouvementsService) {}

  @Post('mouvements/entree')
  @HttpCode(HttpStatus.CREATED)
  entree(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: EntreeStockDto,
  ) {
    return this.mouvementsService.entree(entrepriseId, user.utilisateurId, dto);
  }

  @Post('mouvements/sortie')
  @HttpCode(HttpStatus.CREATED)
  sortie(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: SortieStockDto,
  ) {
    return this.mouvementsService.sortie(entrepriseId, user.utilisateurId, dto);
  }

  @ModuleRequis('transferts')
  @Post('mouvements/transfert')
  @HttpCode(HttpStatus.CREATED)
  transfert(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: TransfertStockDto,
  ) {
    return this.mouvementsService.transfert(
      entrepriseId,
      user.utilisateurId,
      dto,
    );
  }

  @Get('mouvements')
  listerMouvements(
    @CurrentTenant() entrepriseId: string,
    @Query('produit_id') produitId?: string,
    @Query('emplacement_id') emplacementId?: string,
    @Query('type') type?: string,
    @Query('limite') limite?: string,
    @Query('apres') apres?: string,
  ) {
    return this.mouvementsService.listerMouvements(
      entrepriseId,
      { produitId, emplacementId, types: lireTypes(type) },
      lirePagination(limite, apres),
    );
  }

  /** Export CSV complet de l'historique filtré, en flux (une seule requête). */
  @Get('mouvements/export')
  async exporterMouvements(
    @CurrentTenant() entrepriseId: string,
    @Res() res: Response,
    @Query('produit_id') produitId?: string,
    @Query('emplacement_id') emplacementId?: string,
    @Query('type') type?: string,
  ) {
    // Validé avant tout en-tête : une erreur doit rester une réponse 400 en JSON.
    const types = lireTypes(type);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="mouvements-${date}.csv"`,
    );
    // Respecte la contre-pression : on attend que le client lise avant d'écrire la suite.
    const ecrire = (morceau: string) =>
      new Promise<void>((resolve) =>
        res.write(morceau) ? resolve() : res.once('drain', () => resolve()),
      );
    await ecrire(BOM_UTF8);
    await this.mouvementsService.exporterMouvements(
      entrepriseId,
      { produitId, emplacementId, types },
      ecrire,
    );
    res.end();
  }

  @Get('stock')
  listerStock(
    @CurrentTenant() entrepriseId: string,
    @Query('produit_id') produitId?: string,
    @Query('emplacement_id') emplacementId?: string,
  ) {
    return this.mouvementsService.listerStock(entrepriseId, {
      produitId,
      emplacementId,
    });
  }
}
