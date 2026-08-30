import { Module } from '@nestjs/common';
import { EntrepriseController } from './entreprise.controller.js';
import { EntrepriseService } from './entreprise.service.js';

@Module({
  controllers: [EntrepriseController],
  providers: [EntrepriseService],
})
export class EntrepriseModule {}
