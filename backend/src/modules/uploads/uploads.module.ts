import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller.js';
import { CloudinaryService } from './cloudinary.service.js';

@Module({
  controllers: [UploadsController],
  providers: [CloudinaryService],
})
export class UploadsModule {}
