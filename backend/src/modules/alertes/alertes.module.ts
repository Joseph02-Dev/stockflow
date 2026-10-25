import { Module } from '@nestjs/common';
import { AlertesController } from './alertes.controller.js';
import { AlertesService } from './alertes.service.js';
import { AlerteNotificationService } from './alerte-notification.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  // Notifications push des alertes (PushService).
  imports: [NotificationsModule],
  controllers: [AlertesController],
  providers: [AlertesService, AlerteNotificationService],
  // Exporté pour que MouvementsService puisse déclencher les notifications
  // après avoir créé une alerte.
  exports: [AlerteNotificationService],
})
export class AlertesModule {}
