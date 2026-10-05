import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { lirePagination } from '../../common/pagination/pagination.js';
import { PertesService } from './pertes.service.js';
import {
  AnnulerPerteDto,
  DeclarerCasseDto,
  FiltresPertesDto,
} from './dto/pertes.dto.js';

@Controller('pertes')
export class PertesController {
  constructor(private readonly pertesService: PertesService) {}

  /** Tout utilisateur déclare librement : la déclaration est nominative et immuable. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  declarer(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: DeclarerCasseDto,
  ) {
    return this.pertesService.declarer(entrepriseId, user.utilisateurId, dto);
  }

  /** Synthèse du mois (?mois=AAAA-MM, mois en cours par défaut). */
  @Get('synthese')
  synthese(
    @CurrentTenant() entrepriseId: string,
    @Query('mois') mois?: string,
  ) {
    if (mois !== undefined && !/^\d{4}-\d{2}$/.test(mois)) {
      throw new BadRequestException('Mois au format AAAA-MM.');
    }
    return this.pertesService.synthese(entrepriseId, mois);
  }

  @Get()
  lister(
    @CurrentTenant() entrepriseId: string,
    @Query() filtres: FiltresPertesDto,
  ) {
    return this.pertesService.lister(
      entrepriseId,
      filtres,
      lirePagination(filtres.limite, filtres.apres),
    );
  }

  /** Administrateur seulement : mouvement inverse, motif obligatoire. */
  @Roles('ADMIN')
  @Post(':id/annuler')
  @HttpCode(HttpStatus.OK)
  annuler(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnnulerPerteDto,
  ) {
    return this.pertesService.annuler(
      entrepriseId,
      user.utilisateurId,
      id,
      dto.motif,
    );
  }
}
