import { Module } from '@nestjs/common';
import { MouvementsController } from './mouvements.controller.js';
import { MouvementsService } from './mouvements.service.js';
import { AlertesModule } from '../alertes/alertes.module.js';

@Module({
  imports: [AlertesModule],
  controllers: [MouvementsController],
  providers: [MouvementsService],
  // Exporté pour que CommandesService puisse réutiliser entree() lors de
  // la réception d'une commande, plutôt que de dupliquer cette logique.
  exports: [MouvementsService],
})
export class MouvementsModule {}
