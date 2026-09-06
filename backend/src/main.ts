import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // supprime silencieusement les champs non déclarés dans le DTO
      forbidNonWhitelisted: true, // rejette la requête si un champ inattendu est présent
      transform: true,
    }),
  );
  // FRONTEND_URL doit être l'URL exacte du frontend déployé (ex. Netlify).
  // Sans valeur définie, aucune origine n'est autorisée plutôt que
  // d'ouvrir le CORS à tout le monde par défaut.
  if (process.env.FRONTEND_URL) {
    app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true });
  }
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
