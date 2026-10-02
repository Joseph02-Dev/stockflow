import { Module } from '@nestjs/common';
import { MouvementsModule } from '../mouvements/mouvements.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import {
  ClientsVentesController,
  VentesController,
} from './ventes.controller.js';
import { VentesService } from './ventes.service.js';
import { SoldesService } from './soldes.service.js';

@Module({
  imports: [MouvementsModule, ClientsModule],
  controllers: [VentesController, ClientsVentesController],
  providers: [VentesService, SoldesService],
  exports: [SoldesService],
})
export class VentesModule {}
