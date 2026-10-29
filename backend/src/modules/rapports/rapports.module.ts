import { Module } from '@nestjs/common';
import { PdfService } from './pdf/pdf.service.js';
import { RapportClientService } from './rapport-client.service.js';
import { RapportPertesService } from './rapport-pertes.service.js';
import { RapportMouvementsService } from './rapport-mouvements.service.js';
import { RapportStockService } from './rapport-stock.service.js';
import { RapportsController } from './rapports.controller.js';

@Module({
  controllers: [RapportsController],
  providers: [PdfService, RapportStockService, RapportMouvementsService, RapportClientService, RapportPertesService],
  // Partagé avec les factures de vente : un seul fil de rendu PDF.
  exports: [PdfService],
})
export class RapportsModule {}
