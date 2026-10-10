import { Module } from '@nestjs/common';
import { StatistiquesController } from './statistiques.controller.js';
import { StatistiquesService } from './statistiques.service.js';

@Module({
  controllers: [StatistiquesController],
  providers: [StatistiquesService],
})
export class StatistiquesModule {}
