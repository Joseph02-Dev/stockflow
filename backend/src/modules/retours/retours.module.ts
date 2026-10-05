import { Module } from '@nestjs/common';
import { MouvementsModule } from '../mouvements/mouvements.module.js';
import { RetoursFournisseurController } from './retours-fournisseur.controller.js';
import { RetoursFournisseurService } from './retours-fournisseur.service.js';

@Module({
  imports: [MouvementsModule],
  controllers: [RetoursFournisseurController],
  providers: [RetoursFournisseurService],
  exports: [RetoursFournisseurService],
})
export class RetoursModule {}
