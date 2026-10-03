import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Redis } from 'ioredis';
import { describe, it, expect, afterAll } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configurerApplication } from '../../config/application.js';
import { LIMITATION_ACTIVE, LIMITES_STRICTES } from './limitation.js';
import {
  StockageLimitation,
  type ClientRedisLimitation,
} from './stockage-limitation.js';

const REDIS_TEST = process.env.REDIS_URL_TEST;

describe('Stockage de la limitation de débit', () => {
  it('se replie sur la mémoire locale si Redis échoue, sans bloquer le trafic', async () => {
    const enPanne: ClientRedisLimitation = {
      eval: () => Promise.reject(new Error('connexion refusée')),
      quit: () => Promise.resolve(),
    };
    const stockage = new StockageLimitation(enPanne);

    const premier = await stockage.increment('ip', 60_000, 2, 60_000, 'global');
    await stockage.increment('ip', 60_000, 2, 60_000, 'global');
    const troisieme = await stockage.increment(
      'ip',
      60_000,
      2,
      60_000,
      'global',
    );

    expect(premier).toMatchObject({ totalHits: 1, isBlocked: false });
    expect(troisieme.isBlocked).toBe(true);
    await stockage.onApplicationShutdown();
  });

  it('sans REDIS_URL, reste en mémoire comme avant', async () => {
    const ancienne = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    const stockage = StockageLimitation.depuisEnvironnement();
    expect(stockage.distribue).toBe(false);
    await stockage.onApplicationShutdown();
    if (ancienne) process.env.REDIS_URL = ancienne;
  });
});

describe.skipIf(!REDIS_TEST)(
  'Limitation partagée par Redis (REDIS_URL_TEST requis)',
  () => {
    const applications: NestExpressApplication[] = [];
    const redis = REDIS_TEST ? new Redis(REDIS_TEST) : null;

    afterAll(async () => {
      for (const app of applications) await app.close();
      await redis?.flushdb();
      await redis?.quit();
    });

    it('compte, bloque au-delà de la limite puis débloque après la durée de blocage', async () => {
      await redis!.flushdb();
      const stockage = new StockageLimitation(new Redis(REDIS_TEST!));

      const coups = [];
      for (let i = 0; i < 4; i++)
        coups.push(await stockage.increment('cle', 1_000, 3, 400, 'global'));
      expect(coups.map((c) => [c.totalHits, c.isBlocked])).toEqual([
        [1, false],
        [2, false],
        [3, false],
        [4, true],
      ]);
      expect(
        (await stockage.increment('cle', 1_000, 3, 400, 'global')).isBlocked,
      ).toBe(true);

      await new Promise((r) => setTimeout(r, 1_100));
      expect(
        await stockage.increment('cle', 1_000, 3, 400, 'global'),
      ).toMatchObject({ totalHits: 1, isBlocked: false });
      await stockage.onApplicationShutdown();
    });

    it('deux instances de l’API partagent les mêmes compteurs', async () => {
      await redis!.flushdb();
      process.env.REDIS_URL = REDIS_TEST;
      for (let i = 0; i < 2; i++) {
        const moduleRef = await Test.createTestingModule({
          imports: [AppModule],
        })
          .overrideProvider(LIMITATION_ACTIVE)
          .useValue(true)
          .compile();
        const app = moduleRef.createNestApplication<NestExpressApplication>();
        configurerApplication(app);
        await app.init();
        applications.push(app);
      }
      delete process.env.REDIS_URL;

      const connexion = (app: NestExpressApplication) =>
        request(app.getHttpServer())
          .post('/auth/login')
          .set('X-Forwarded-For', '198.51.100.77')
          .send({
            email: 'personne@exemple.com',
            password: 'mauvais-mot-de-passe',
          });

      // Les 8 tentatives autorisées, réparties entre les deux instances…
      for (let i = 0; i < LIMITES_STRICTES.connexion.limit; i++) {
        expect((await connexion(applications[i % 2])).status).toBe(401);
      }
      // … épuisent le quota commun : la 9e est refusée, sur l'une comme sur l'autre.
      expect((await connexion(applications[0])).status).toBe(429);
      expect((await connexion(applications[1])).status).toBe(429);
    });
  },
);
