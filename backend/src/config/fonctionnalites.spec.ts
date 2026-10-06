import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { PrismaService } from './prisma.service.js';
import { diagnostiquerEnvironnement } from './environnement.js';
import { fonctionnalitesInconnues, fonctionnalitesSuspendues } from './fonctionnalites.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../modules/console/console-test.utils.js';

describe('FONCTIONNALITES_DESACTIVEES — lecture', () => {
  it('liste, casse et espaces tolérés ; noms inconnus signalés à part', () => {
    const env = { FONCTIONNALITES_DESACTIVEES: ' Rapports, import ,rapports,raports' };
    expect(fonctionnalitesSuspendues(env)).toEqual(['rapports', 'import']);
    expect(fonctionnalitesInconnues(env)).toEqual(['raports']);
    expect(fonctionnalitesSuspendues({})).toEqual([]);
  });

  it('une faute de frappe est un avertissement au démarrage, jamais un blocage', () => {
    const { erreurs, avertissements } = diagnostiquerEnvironnement({
      DATABASE_URL: 'postgresql://x',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      FONCTIONNALITES_DESACTIVEES: 'raports',
    });
    expect(erreurs).toEqual([]);
    expect(avertissements.join(' ')).toMatch(/raports/);
  });
});

/** Interrupteurs globaux — application réelle. */
describe('Interrupteurs globaux — intégration réelle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const entrepriseIds: string[] = [];
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, 'Ets Interrupteurs');
    entrepriseIds.push(entreprise.id);
    token = (await connecterClient(app, utilisateur.email)).body.accessToken;
  });

  afterEach(() => {
    delete process.env.FONCTIONNALITES_DESACTIVEES;
  });

  afterAll(async () => {
    await nettoyer(prisma, entrepriseIds, []);
    await app.close();
  });

  const get = (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);

  it('par défaut tout est actif, et l’interface le sait', async () => {
    expect((await get('/rapports/stock')).status).toBe(200);
    expect((await get('/entreprise')).body.fonctionnalitesSuspendues).toEqual([]);
  });

  it('coupée : 503 explicite sur toutes ses routes, le reste de l’application intact', async () => {
    process.env.FONCTIONNALITES_DESACTIVEES = 'rapports,import';
    const rapport = await get('/rapports/stock');
    expect(rapport.status).toBe(503);
    expect(rapport.body).toMatchObject({ code: 'FONCTIONNALITE_SUSPENDUE', message: expect.stringMatching(/rapports.*indisponible/) });
    const ouverture = await request(app.getHttpServer())
      .post('/produits/import/session')
      .set('Authorization', `Bearer ${token}`)
      .send({ nomFichier: 'catalogue.csv' });
    expect(ouverture.status).toBe(503);
    expect((await get('/produits')).status).toBe(200);
    expect((await get('/entreprise')).body.fonctionnalitesSuspendues).toEqual(['rapports', 'import']);
  });

  it('sans jeton : 503 avant toute autre vérification, sans lecture en base', async () => {
    process.env.FONCTIONNALITES_DESACTIVEES = 'rapports';
    expect((await request(app.getHttpServer()).get('/rapports/stock')).status).toBe(503);
  });
});
