import 'dotenv/config';
import cluster from 'node:cluster';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configurerApplication } from './config/application.js';
import { diagnostiquerEnvironnement } from './config/environnement.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configurerApplication(app);
  // Arrêt propre sur SIGTERM (redéploiement Railway) : connexions à la
  // base et à Redis fermées, requêtes en cours terminées.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

/**
 * Mode multi-processus (WEB_CONCURRENCY > 1) : Node n'exécute le
 * JavaScript que sur un cœur par processus ; le processus principal lance
 * N copies de l'API qui se partagent le même port, pour utiliser tous les
 * vCPU du conteneur. Sans la variable : un seul processus, comme avant.
 */
function demarrerProcessus(nombre: number) {
  const journal = new Logger('Processus');
  if (!process.env.REDIS_URL) {
    journal.warn(
      'WEB_CONCURRENCY > 1 sans REDIS_URL : chaque processus compte ses propres limites de débit (limite réelle multipliée).',
    );
  }
  let arret = false;
  for (let i = 0; i < nombre; i++) cluster.fork();
  // Un processus qui s'arrête de lui-même est relancé ; pas pendant un arrêt demandé.
  cluster.on('exit', (processus, code, signal) => {
    if (arret) return;
    journal.error(`Processus ${processus.process.pid} arrêté (${signal ?? code}) : relance.`);
    cluster.fork();
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      arret = true;
      for (const processus of Object.values(cluster.workers ?? {})) processus?.kill(signal);
    });
  }
  journal.log(`${nombre} processus API démarrés.`);
}

// Environnement vérifié avant toute connexion : une variable manquante
// arrête le démarrage avec un message clair ; une faiblesse est signalée.
const diagnostic = diagnostiquerEnvironnement(process.env);
const journalConfig = new Logger('Configuration');
for (const avertissement of diagnostic.avertissements) journalConfig.warn(avertissement);
if (diagnostic.erreurs.length > 0) {
  for (const erreur of diagnostic.erreurs) journalConfig.error(erreur);
  process.exit(1);
}

const nombreProcessus = Number(process.env.WEB_CONCURRENCY ?? 1);
if (cluster.isPrimary && Number.isInteger(nombreProcessus) && nombreProcessus > 1) {
  demarrerProcessus(nombreProcessus);
} else {
  await bootstrap();
}
