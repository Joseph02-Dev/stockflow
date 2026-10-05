import { Module } from '@nestjs/common';
import { PdfService } from './pdf/pdf.service.js';
import { RapportStockService } from './rapport-stock.service.js';
import { RapportsController } from './rapports.controller.js';

@Module({
  controllers: [RapportsController],
  providers: [PdfService, RapportStockService],
})
export class RapportsModule {}
