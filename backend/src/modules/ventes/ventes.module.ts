import { Module } from '@nestjs/common';
import { MouvementsModule } from '../mouvements/mouvements.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { RetoursModule } from '../retours/retours.module.js';
import {
  ClientsVentesController,
  CreancesController,
  VentesController,
} from './ventes.controller.js';
import { VentesService } from './ventes.service.js';
import { SoldesService } from './soldes.service.js';
import { CreancesService } from './creances.service.js';
import { RetoursClientService } from './retours-client.service.js';

@Module({
  imports: [MouvementsModule, ClientsModule, RetoursModule],
  controllers: [VentesController, ClientsVentesController, CreancesController],
  providers: [
    VentesService,
    SoldesService,
    CreancesService,
    RetoursClientService,
  ],
  exports: [SoldesService],
})
export class VentesModule {}
