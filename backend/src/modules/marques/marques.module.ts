import { Module } from '@nestjs/common';
import { MarquesController } from './marques.controller.js';
import { MarquesService } from './marques.service.js';

@Module({
  controllers: [MarquesController],
  providers: [MarquesService],
})
export class MarquesModule {}
