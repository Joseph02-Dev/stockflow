import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configurerApplication } from './config/application.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configurerApplication(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
