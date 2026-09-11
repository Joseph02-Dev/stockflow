import { Module } from '@nestjs/common';
import { InventairesController } from './inventaires.controller.js';
import { InventairesService } from './inventaires.service.js';
import { AlertesModule } from '../alertes/alertes.module.js';

@Module({
  imports: [AlertesModule],
  controllers: [InventairesController],
  providers: [InventairesService],
})
export class InventairesModule {}
