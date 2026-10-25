import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PushService } from './push.service.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService],
  exports: [PushService],
})
export class NotificationsModule {}
