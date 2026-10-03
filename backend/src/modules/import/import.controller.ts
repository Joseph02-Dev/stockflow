import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { ImportService } from './import.service.js';
import {
  LotLignesDto,
  OptionsImportDto,
  OuvrirImportDto,
} from './dto/import.dto.js';

/**
 * Import de catalogue. Le fichier reste dans le navigateur : seules ses
 * lignes, déjà associées aux champs, arrivent ici, par lots de 200.
 */
@Controller('produits/import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Get('modele')
  async modele(
    @CurrentTenant() entrepriseId: string,
    @Query('type') type: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { nom, contenu } = await this.importService.modele(
      entrepriseId,
      type,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
    return contenu;
  }

  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  ouvrir(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: OuvrirImportDto,
  ) {
    return this.importService.ouvrir(
      entrepriseId,
      user.utilisateurId,
      dto.nomFichier,
    );
  }

  @Post('session/:id/lignes')
  @HttpCode(HttpStatus.OK)
  lignes(
    @CurrentTenant() entrepriseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LotLignesDto,
  ) {
    return this.importService.ajouterLignes(entrepriseId, id, dto);
  }

  @Post('session/:id/verifier')
  @HttpCode(HttpStatus.OK)
  verifier(
    @CurrentTenant() entrepriseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OptionsImportDto,
  ) {
    return this.importService.verifier(entrepriseId, id, dto);
  }

  @Post('session/:id/executer')
  @HttpCode(HttpStatus.OK)
  executer(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OptionsImportDto,
  ) {
    return this.importService.executer(
      entrepriseId,
      user.utilisateurId,
      id,
      dto,
    );
  }

  @Post(':id/annuler')
  @HttpCode(HttpStatus.OK)
  annuler(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importService.annuler(entrepriseId, user.utilisateurId, id);
  }
}
