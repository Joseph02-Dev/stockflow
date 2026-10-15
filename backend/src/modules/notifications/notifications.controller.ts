import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { MarquerLuesDto } from './dto/marquer-lues.dto.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

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
}
