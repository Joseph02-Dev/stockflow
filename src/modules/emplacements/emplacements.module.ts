import { Module } from '@nestjs/common';
import { EmplacementsController } from './emplacements.controller.js';
import { EmplacementsService } from './emplacements.service.js';

@Module({
  controllers: [EmplacementsController],
  providers: [EmplacementsService],
})
export class EmplacementsModule {}
