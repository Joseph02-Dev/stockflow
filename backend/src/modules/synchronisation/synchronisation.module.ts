import { Module } from '@nestjs/common';
import { SynchronisationController } from './synchronisation.controller.js';
import { SynchronisationService } from './synchronisation.service.js';

@Module({
  controllers: [SynchronisationController],
  providers: [SynchronisationService],
})
export class SynchronisationModule {}
