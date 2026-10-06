import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { ErrorEvent } from '@sentry/nestjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { PrismaService } from './prisma.service.js';
import { nettoyerEvenement, optionsSentry } from './surveillance.js';
import { EntrepriseService } from '../modules/entreprise/entreprise.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../modules/console/console-test.utils.js';

const DSN_FICTIF = 'https://cle-publique@o1.ingest.exemple.invalid/1';

describe('Sentry — configuration', () => {
  it('inactif sans DSN et pendant les tests : rien ne change', () => {
    expect(optionsSentry({})).toBeNull();
    expect(optionsSentry({ SENTRY_DSN: DSN_FICTIF, NODE_ENV: 'test' })).toBeNull();
    expect(optionsSentry({ SENTRY_DSN: DSN_FICTIF, NODE_ENV: 'production', RAILWAY_ENVIRONMENT_NAME: 'production' })).toMatchObject({
      dsn: DSN_FICTIF,
      environment: 'production',
      dataCollection: { httpHeaders: false, cookies: false, httpBodies: [], stackFrameVariables: false, userInfo: false },
    });
  });

  it('nettoyage : ni en-têtes, ni cookies, ni corps, ni IP, jetons d’URL masqués', () => {
    const evenement = nettoyerEvenement({
      type: undefined,
      request: {
        method: 'POST',
        url: 'https://api.exemple/auth/verify-email?token=SECRET-JETON',
        headers: { authorization: 'Bearer SECRET-ACCES' },
        cookies: { session: 'SECRET-COOKIE' },
        data: { password: 'SECRET-MDP' },
      },
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
    } as ErrorEvent);
    expect(evenement.request).toEqual({ method: 'POST', url: expect.stringContaining('/auth/verify-email?token=') });
    expect(evenement.user).toEqual({ id: 'u1' });
    expect(JSON.stringify(evenement)).not.toMatch(/SECRET|1\.2\.3\.4|a@b\.c/);
  });
});

/** Remontée réelle : SDK initialisé, envoi intercepté (aucun appel réseau). */
describe('Sentry — erreurs inattendues, intégration réelle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const envoyes: ErrorEvent[] = [];
  const entrepriseIds: string[] = [];
  let admin: { token: string; entrepriseId: string; utilisateurId: string };

  beforeAll(async () => {
    const options = optionsSentry({ SENTRY_DSN: DSN_FICTIF, NODE_ENV: 'production' })!;
    Sentry.init({
      ...options,
      beforeSend: (evenement, indice) => {
        envoyes.push(options.beforeSend!(evenement, indice) as ErrorEvent);
        return null;
      },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EntrepriseService)
      .useValue({
        getEntreprise: () => {
          throw new Error('panne simulée');
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, 'Ets Surveillance');
    entrepriseIds.push(entreprise.id);
    const connexion = await connecterClient(app, utilisateur.email);
    admin = { token: connexion.body.accessToken, entrepriseId: entreprise.id, utilisateurId: utilisateur.id };
  });

  beforeEach(() => {
    envoyes.length = 0;
  });

  afterAll(async () => {
    await nettoyer(prisma, entrepriseIds, []);
    await app.close();
    await Sentry.close();
  });

  const get = (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${admin.token}`);

  it('une panne remonte avec entreprise, utilisateur et identifiant de requête ; le client reçoit un 500 sans détail', async () => {
    const reponse = await get('/entreprise');
    expect(reponse.status).toBe(500);
    expect(reponse.body).toEqual({ statusCode: 500, message: 'Internal server error' });
    await Sentry.flush(2000);
    expect(envoyes).toHaveLength(1);
    const [evenement] = envoyes;
    expect(evenement.exception?.values?.[0]?.value).toBe('panne simulée');
    expect(evenement.tags).toMatchObject({
      entrepriseId: admin.entrepriseId,
      requestId: reponse.headers['x-request-id'],
      route: 'GET /entreprise',
    });
    expect(evenement.user).toEqual({ id: admin.utilisateurId });
    expect(JSON.stringify(evenement)).not.toContain(admin.token);
    expect(JSON.stringify(evenement)).not.toMatch(/Bearer|authorization/i);
  });

  it('les réponses voulues (404, 401, 400) ne remontent jamais', async () => {
    expect((await get('/produits/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await request(app.getHttpServer()).get('/produits')).status).toBe(401);
    const invalide = await request(app.getHttpServer()).post('/users/pas-un-uuid/desactiver').set('Authorization', `Bearer ${admin.token}`);
    expect(invalide.status).toBe(400);
    await Sentry.flush(2000);
    expect(envoyes).toEqual([]);
  });
});
