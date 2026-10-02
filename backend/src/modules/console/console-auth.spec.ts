import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import {
  connecterClient,
  connecterOperateur,
  creerEntrepriseAvecAdmin,
  creerOperateur,
  nettoyer,
  MOT_DE_PASSE_TEST,
} from './console-test.utils.js';

// Complétée à chaque nouvelle route console : toutes doivent refuser un token client.
const ROUTES_CONSOLE_PROTEGEES = [
  '/console/auth/moi',
  '/console/apercu',
  '/console/entreprises',
  '/console/entreprises/00000000-0000-4000-8000-000000000000',
  '/console/entreprises/00000000-0000-4000-8000-000000000000/stock',
  '/console/entreprises/00000000-0000-4000-8000-000000000000/mouvements',
];

describe('Console — authentification opérateur séparée (intégration réelle)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const entrepriseIds: string[] = [];
  const operateurIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterEach(async () => {
    await nettoyer(prisma, entrepriseIds.splice(0), operateurIds.splice(0));
  });

  afterAll(async () => {
    await app.close();
  });

  it('connecte un opérateur et inscrit la connexion au journal', async () => {
    const operateur = await creerOperateur(prisma);
    operateurIds.push(operateur.id);

    const reponse = await request(app.getHttpServer())
      .post('/console/auth/login')
      .send({ email: operateur.email, motDePasse: MOT_DE_PASSE_TEST });

    expect(reponse.status).toBe(200);
    expect(reponse.body.accessToken).toBeDefined();
    expect(reponse.body.operateur.email).toBe(operateur.email);
    const journal = await prisma.journalAudit.findMany({ where: { operateurId: operateur.id } });
    expect(journal.map((e) => e.action)).toEqual(['CONNEXION']);
    const enBase = await prisma.operateur.findUniqueOrThrow({ where: { id: operateur.id } });
    expect(enBase.derniereConnexionAt).not.toBeNull();
  });

  it('refuse un mauvais mot de passe opérateur avec un message générique', async () => {
    const operateur = await creerOperateur(prisma);
    operateurIds.push(operateur.id);

    const reponse = await request(app.getHttpServer())
      .post('/console/auth/login')
      .send({ email: operateur.email, motDePasse: 'mauvais-mot-de-passe' });

    expect(reponse.status).toBe(401);
    expect(reponse.body.message).toBe('Email ou mot de passe incorrect.');
  });

  it('refuse les identifiants d’un utilisateur client sur la connexion console', async () => {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma);
    entrepriseIds.push(entreprise.id);

    const reponse = await request(app.getHttpServer())
      .post('/console/auth/login')
      .send({ email: utilisateur.email, motDePasse: MOT_DE_PASSE_TEST });

    expect(reponse.status).toBe(401);
  });

  it('refuse un token client sur /console/* (401)', async () => {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma);
    entrepriseIds.push(entreprise.id);
    const tokenClient = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    expect(tokenClient).toBeDefined();

    for (const route of ROUTES_CONSOLE_PROTEGEES) {
      const reponse = await request(app.getHttpServer()).get(route).set('Authorization', `Bearer ${tokenClient}`);
      expect(reponse.status, route).toBe(401);
    }
  });

  it('refuse un token opérateur sur les routes clientes (401)', async () => {
    const operateur = await creerOperateur(prisma);
    operateurIds.push(operateur.id);
    const tokenOperateur = await connecterOperateur(app, operateur.email);
    expect(tokenOperateur).toBeDefined();

    // Contrôle : le token est bien valide côté console…
    const moi = await request(app.getHttpServer()).get('/console/auth/moi').set('Authorization', `Bearer ${tokenOperateur}`);
    expect(moi.status).toBe(200);

    // …mais n'ouvre aucune route de l'application cliente.
    for (const route of ['/produits', '/dashboard/overview', '/stock', '/users']) {
      const reponse = await request(app.getHttpServer()).get(route).set('Authorization', `Bearer ${tokenOperateur}`);
      expect(reponse.status, route).toBe(401);
    }
  });

  it('refuse /console/* sans token et avec un token falsifié', async () => {
    const sansToken = await request(app.getHttpServer()).get('/console/auth/moi');
    expect(sansToken.status).toBe(401);

    const falsifie = await request(app.getHttpServer())
      .get('/console/auth/moi')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4IiwidHlwIjoiY29uc29sZSJ9.signature');
    expect(falsifie.status).toBe(401);
  });
});
