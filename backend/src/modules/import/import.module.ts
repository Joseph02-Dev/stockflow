import { Module } from '@nestjs/common';
import { MouvementsModule } from '../mouvements/mouvements.module.js';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';

@Module({
  imports: [MouvementsModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
