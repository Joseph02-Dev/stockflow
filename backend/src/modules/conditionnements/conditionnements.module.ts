import { Module } from '@nestjs/common';
import { ConditionnementsController } from './conditionnements.controller.js';
import { ConditionnementsService } from './conditionnements.service.js';

@Module({
  controllers: [ConditionnementsController],
  providers: [ConditionnementsService],
  // MouvementsService convertit les saisies en conditionnement.
  exports: [ConditionnementsService],
})
export class ConditionnementsModule {}
