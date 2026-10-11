import { Module } from '@nestjs/common';
import { ReapproPlanificateur } from './reappro-planificateur.js';
import { ReapprovisionnementController } from './reapprovisionnement.controller.js';
import { ReapprovisionnementService } from './reapprovisionnement.service.js';

@Module({
  controllers: [ReapprovisionnementController],
  providers: [ReapprovisionnementService, ReapproPlanificateur],
})
export class ReapprovisionnementModule {}
