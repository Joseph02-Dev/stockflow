import { Module } from '@nestjs/common';
import { ValorisationController } from './valorisation.controller.js';
import { ValorisationService } from './valorisation.service.js';

@Module({
  controllers: [ValorisationController],
  providers: [ValorisationService],
})
export class ValorisationModule {}
