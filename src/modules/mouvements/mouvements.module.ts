import { Module } from '@nestjs/common';
import { MouvementsController } from './mouvements.controller.js';
import { MouvementsService } from './mouvements.service.js';

@Module({
  controllers: [MouvementsController],
  providers: [MouvementsService],
})
export class MouvementsModule {}
