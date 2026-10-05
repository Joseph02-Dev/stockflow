import { Module } from '@nestjs/common';
import { MouvementsModule } from '../mouvements/mouvements.module.js';
import { PertesController } from './pertes.controller.js';
import { PertesService } from './pertes.service.js';

@Module({
  imports: [MouvementsModule],
  controllers: [PertesController],
  providers: [PertesService],
  exports: [PertesService],
})
export class PertesModule {}
