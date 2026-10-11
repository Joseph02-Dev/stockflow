import { Module } from '@nestjs/common';
import { ModelesController } from './modeles.controller.js';
import { ModelesService } from './modeles.service.js';

@Module({
  controllers: [ModelesController],
  providers: [ModelesService],
})
export class ModelesModule {}
