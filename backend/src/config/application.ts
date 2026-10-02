import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/**
 * Configuration HTTP commune à l'application réelle (main.ts) et aux
 * tests qui doivent observer les mêmes en-têtes : un seul endroit, pour
 * qu'un test ne valide jamais une configuration différente de la prod.
 */
export function configurerApplication(app: NestExpressApplication): void {
  // Railway place un proxy unique devant l'application : sans cette ligne,
  // req.ip vaut l'adresse du proxy et tous les clients partagent le même
  // compteur de limitation de débit. « 1 » = on ne fait confiance qu'au
  // dernier saut de X-Forwarded-For, pour qu'un client ne puisse pas
  // usurper une IP en forgeant l'en-tête lui-même.
  app.set('trust proxy', 1);

  // Ne pas annoncer la pile technique (helmet le retire aussi ; on le
  // désactive explicitement pour ne pas dépendre de ce détail).
  app.disable('x-powered-by');

  // L'API ne sert que du JSON, jamais de page : la CSP la plus stricte
  // possible (aucune ressource, aucun encadrement) ne casse rien et
  // neutralise une réponse qui serait un jour interprétée comme du HTML.
  // Le frontend (Vercel) a sa propre origine : cette CSP ne s'y applique
  // pas. HSTS reste celui de helmet (1 an, sous-domaines inclus).
  // Cross-Origin-Resource-Policy reste « same-origin » : il ne concerne
  // que les chargements sans CORS (img, script) de nos propres réponses ;
  // les appels XHR du frontend passent par CORS, et les photos produits
  // sont servies par Cloudinary avec ses propres en-têtes.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
    }),
  );

  // Limite explicite des corps JSON (les images passent en multipart,
  // limitées à 5 Mo par le contrôleur d'upload).
  app.useBodyParser('json', { limit: '1mb' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // supprime silencieusement les champs non déclarés dans le DTO
      forbidNonWhitelisted: true, // rejette la requête si un champ inattendu est présent
      transform: true,
    }),
  );

  // FRONTEND_URL doit être l'URL exacte du frontend déployé (ex. Vercel).
  // Sans valeur définie, aucune origine n'est autorisée plutôt que
  // d'ouvrir le CORS à tout le monde par défaut.
  if (process.env.FRONTEND_URL) {
    app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true });
  }
}
