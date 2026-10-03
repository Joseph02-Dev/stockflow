import { Module } from '@nestjs/common';
import { MouvementsModule } from '../mouvements/mouvements.module.js';
import { LotsController } from './lots.controller.js';
import { LotsService } from './lots.service.js';

@Module({
  imports: [MouvementsModule],
  controllers: [LotsController],
  providers: [LotsService],
})
export class LotsModule {}
