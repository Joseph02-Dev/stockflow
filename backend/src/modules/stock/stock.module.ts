import { Module } from '@nestjs/common';
import { MouvementsModule } from '../mouvements/mouvements.module.js';
import { StockController } from './stock.controller.js';
import { StockService } from './stock.service.js';

@Module({
  imports: [MouvementsModule],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
