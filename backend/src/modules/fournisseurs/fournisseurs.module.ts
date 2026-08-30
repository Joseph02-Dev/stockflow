import { Module } from '@nestjs/common';
import { FournisseursController } from './fournisseurs.controller.js';
import { FournisseursService } from './fournisseurs.service.js';

@Module({
  controllers: [FournisseursController],
  providers: [FournisseursService],
})
export class FournisseursModule {}
