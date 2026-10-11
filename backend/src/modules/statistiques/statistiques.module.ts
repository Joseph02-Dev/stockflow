import { Module } from '@nestjs/common';
import { StatistiquesController } from './statistiques.controller.js';
import { StatistiquesService } from './statistiques.service.js';
import { RotationService } from './rotation.service.js';

@Module({
  controllers: [StatistiquesController],
  providers: [StatistiquesService, RotationService],
})
export class StatistiquesModule {}
