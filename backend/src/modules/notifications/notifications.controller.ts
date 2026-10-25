import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { MarquerLuesDto } from './dto/marquer-lues.dto.js';
import { NotificationsService } from './notifications.service.js';
import { AbonnementPushDto, DesabonnementPushDto } from './dto/abonnement-push.dto.js';
import { PushService } from './push.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly push: PushService,
  ) {}

  @Get()
  lister(@CurrentTenant() entrepriseId: string, @CurrentUser() user: RequestContext) {
    return this.notificationsService.lister(entrepriseId, user.utilisateurId);
  }

  @Post('lues')
  @HttpCode(HttpStatus.NO_CONTENT)
  async marquerLues(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: MarquerLuesDto,
  ) {
    await this.notificationsService.marquerLues(entrepriseId, user.utilisateurId, dto.cles);
  }

  /** Clé publique d'abonnement push ; null si le push n'est pas configuré sur ce serveur. */
  @Get('push/cle')
  clePush() {
    return { clePublique: this.push.clePublique };
  }

  /** Cet appareil reçoit désormais les alertes en notification push. */
  @Post('push/abonnement')
  @HttpCode(HttpStatus.NO_CONTENT)
  async abonnerPush(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: AbonnementPushDto,
  ) {
    await this.push.abonner(entrepriseId, user.utilisateurId, dto);
  }

  /** Appareil désabonné : à la déconnexion, ou à la demande. */
  @Delete('push/abonnement')
  @HttpCode(HttpStatus.NO_CONTENT)
  async desabonnerPush(@CurrentUser() user: RequestContext, @Body() dto: DesabonnementPushDto) {
    await this.push.desabonner(user.utilisateurId, dto.endpoint);
  }
}
