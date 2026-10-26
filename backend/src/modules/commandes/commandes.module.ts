import { Module } from '@nestjs/common';
import { CommandesController } from './commandes.controller.js';
import { CommandesService } from './commandes.service.js';
import { MouvementsModule } from '../mouvements/mouvements.module.js';
import { RangementModule } from '../rangement/rangement.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ReceptionNotificationService } from './reception-notification.service.js';

@Module({
  imports: [MouvementsModule, RangementModule, NotificationsModule],
  controllers: [CommandesController],
  providers: [CommandesService, ReceptionNotificationService],
})
export class CommandesModule {}
