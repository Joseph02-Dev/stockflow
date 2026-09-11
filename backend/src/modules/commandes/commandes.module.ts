import { Module } from '@nestjs/common';
import { CommandesController } from './commandes.controller.js';
import { CommandesService } from './commandes.service.js';
import { MouvementsModule } from '../mouvements/mouvements.module.js';

@Module({
  imports: [MouvementsModule],
  controllers: [CommandesController],
  providers: [CommandesService],
})
export class CommandesModule {}
