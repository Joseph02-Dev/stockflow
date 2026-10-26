import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PushService } from './push.service.js';
import { PeremptionPlanificateur } from './peremption-planificateur.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService, PeremptionPlanificateur],
  exports: [PushService],
})
export class NotificationsModule {}
