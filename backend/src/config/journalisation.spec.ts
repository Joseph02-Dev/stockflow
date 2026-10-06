import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PARAMS_PROVIDER_TOKEN } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { PrismaService } from './prisma.service.js';
import { optionsJournalisation, urlJournalisee } from './journalisation.js';
import { MOT_DE_PASSE_TEST, connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../modules/console/console-test.utils.js';

describe('urlJournalisee', () => {
  it('masque les paramètres sensibles, garde les autres', () => {
    expect(urlJournalisee('/auth/verifier?token=abc&x=1')).toBe('/auth/verifier?token=%5Bmasqu%C3%A9%5D&x=1');
    expect(urlJournalisee('/mouvements?produit_id=p1&limite=20')).toBe('/mouvements?produit_id=p1&limite=20');
    expect(urlJournalisee('/produits')).toBe('/produits');
    expect(urlJournalisee(undefined)).toBe('');
  });
});

/** Journaux JSON par requête — application réelle, sortie capturée. */
describe('Journaux structurés — intégration réelle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const lignes: string[] = [];
  const entrepriseIds: string[] = [];
  let admin: { email: string; token: string; entrepriseId: string; utilisateurId: string };

  beforeAll(async () => {
    const sortie = { write: (ligne: string) => void lignes.push(ligne) };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PARAMS_PROVIDER_TOKEN)
      .useValue(optionsJournalisation({ LOG_LEVEL: 'info' }, sortie))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, 'Ets Journal');
    entrepriseIds.push(entreprise.id);
    const connexion = await connecterClient(app, utilisateur.email);
    admin = { email: utilisateur.email, token: connexion.body.accessToken, entrepriseId: entreprise.id, utilisateurId: utilisateur.id };
  });

  beforeEach(() => {
    lignes.length = 0;
  });

  afterAll(async () => {
    await nettoyer(prisma, entrepriseIds, []);
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const journaux = () => lignes.map((l) => JSON.parse(l) as Record<string, any>);

  it('une ligne JSON par requête : identifiant, entreprise, utilisateur, statut, durée — niveau en toutes lettres', async () => {
    const r = await http().get('/produits').set('Authorization', `Bearer ${admin.token}`);
    expect(r.status).toBe(200);
    const [ligne] = journaux().filter((j) => j.req?.url === '/produits');
    expect(ligne).toMatchObject({
      level: 'info',
      message: 'request completed',
      entrepriseId: admin.entrepriseId,
      utilisateurId: admin.utilisateurId,
      req: { method: 'GET', id: r.headers['x-request-id'] },
      res: { statusCode: 200 },
    });
    expect(typeof ligne.responseTime).toBe('number');
    expect(ligne.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('jamais de jeton, d’en-tête, de corps ni de mot de passe dans les journaux', async () => {
    await http().get('/produits?token=VALEUR-SECRETE').set('Authorization', `Bearer ${admin.token}`).set('Cookie', 'session=COOKIE-SECRET');
    const refus = await http().post('/auth/login').send({ email: admin.email, password: 'MAUVAIS-MOT-DE-PASSE' });
    await http().post('/auth/login').send({ email: admin.email, password: MOT_DE_PASSE_TEST });
    expect(refus.status).toBe(401);
    const tout = lignes.join('\n');
    for (const secret of [admin.token, 'Bearer', 'VALEUR-SECRETE', 'COOKIE-SECRET', 'MAUVAIS-MOT-DE-PASSE', MOT_DE_PASSE_TEST, 'accessToken']) {
      expect(tout).not.toContain(secret);
    }
    // Échec client : niveau warn, sans entreprise (pas de jeton).
    const echec = journaux().find((j) => j.req?.url === '/auth/login' && j.res?.statusCode === 401);
    expect(echec).toMatchObject({ level: 'warn' });
    expect(echec).not.toHaveProperty('entrepriseId');
  });

  it('identifiant de requête : repris du proxy s’il est valide, remplacé sinon', async () => {
    const repris = await http().get('/').set('X-Request-Id', 'proxy-1234abcd');
    expect(repris.headers['x-request-id']).toBe('proxy-1234abcd');
    const remplace = await http().get('/').set('X-Request-Id', 'x"; injection');
    expect(remplace.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(lignes.join('\n')).not.toContain('injection');
  });

  it('le healthcheck n’est pas journalisé', async () => {
    await http().get('/health');
    expect(journaux().some((j) => j.req?.url === '/health')).toBe(false);
  });
});
