import { Module } from '@nestjs/common';
import { MouvementsController } from './mouvements.controller.js';
import { MouvementsService } from './mouvements.service.js';
import { AlertesModule } from '../alertes/alertes.module.js';

@Module({
  imports: [AlertesModule],
  controllers: [MouvementsController],
  providers: [MouvementsService],
})
export class MouvementsModule {}
