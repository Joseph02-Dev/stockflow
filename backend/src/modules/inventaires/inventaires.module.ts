import { Module } from '@nestjs/common';
import { InventairesController } from './inventaires.controller.js';
import { InventairesService } from './inventaires.service.js';
import { AlertesModule } from '../alertes/alertes.module.js';
import { MouvementsModule } from '../mouvements/mouvements.module.js';

@Module({
  imports: [AlertesModule, MouvementsModule],
  controllers: [InventairesController],
  providers: [InventairesService],
})
export class InventairesModule {}
