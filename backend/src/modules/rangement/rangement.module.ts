import { Module } from '@nestjs/common';
import { RangementController } from './rangement.controller.js';
import { RangementService } from './rangement.service.js';

@Module({
  controllers: [RangementController],
  providers: [RangementService],
  // La réception de commande applique les règles de rangement.
  exports: [RangementService],
})
export class RangementModule {}
