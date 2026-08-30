import { Module } from '@nestjs/common';
import { ProduitsController } from './produits.controller.js';
import { ProduitsService } from './produits.service.js';

@Module({
  controllers: [ProduitsController],
  providers: [ProduitsService],
})
export class ProduitsModule {}
