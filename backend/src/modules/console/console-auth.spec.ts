import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import {
  codeActuel,
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
  '/console/journal',
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

  const http = () => request(app.getHttpServer());

  it('mot de passe puis code : session ouverte et connexion inscrite au journal', async () => {
    const operateur = await creerOperateur(prisma);
    operateurIds.push(operateur.id);

    const etape = await http().post('/console/auth/login').send({ email: operateur.email, motDePasse: MOT_DE_PASSE_TEST });
    expect(etape.status).toBe(200);
    expect(etape.body).toEqual({ etape: 'CODE', jetonEtape: expect.any(String) });
    // Le mot de passe seul n'ouvre rien : pas encore de connexion au journal.
    expect(await prisma.journalAudit.count({ where: { operateurId: operateur.id } })).toBe(0);

    const reponse = await http()
      .post('/console/auth/code')
      .send({ jetonEtape: etape.body.jetonEtape, code: codeActuel(operateur.totpSecret!) });
    expect(reponse.status).toBe(200);
    expect(reponse.body.accessToken).toBeDefined();
    expect(reponse.body.operateur.email).toBe(operateur.email);
    const journal = await prisma.journalAudit.findMany({ where: { operateurId: operateur.id } });
    expect(journal.map((e) => e.action)).toEqual(['CONNEXION']);
    const enBase = await prisma.operateur.findUniqueOrThrow({ where: { id: operateur.id } });
    expect(enBase.derniereConnexionAt).not.toBeNull();
    expect((await http().get('/console/auth/moi').set('Authorization', `Bearer ${reponse.body.accessToken}`)).status).toBe(200);
  });

  it('premier passage : clé et QR code remis, enrôlement confirmé par le premier code juste', async () => {
    const operateur = await creerOperateur(prisma, { enrole: false });
    operateurIds.push(operateur.id);

    const etape = await http().post('/console/auth/login').send({ email: operateur.email, motDePasse: MOT_DE_PASSE_TEST });
    expect(etape.body).toMatchObject({ etape: 'ENROLEMENT', secret: expect.stringMatching(/^[A-Z2-7]{32}$/) });
    expect(etape.body.otpauth).toContain(`secret=${etape.body.secret}`);
    expect((await prisma.operateur.findUniqueOrThrow({ where: { id: operateur.id } })).totpActifAt).toBeNull();

    const faux = await http().post('/console/auth/code').send({ jetonEtape: etape.body.jetonEtape, code: '000000' });
    expect(faux.status).toBe(401);
    const juste = await http()
      .post('/console/auth/code')
      .send({ jetonEtape: etape.body.jetonEtape, code: codeActuel(etape.body.secret as string) });
    expect(juste.status).toBe(200);
    expect((await prisma.operateur.findUniqueOrThrow({ where: { id: operateur.id } })).totpActifAt).not.toBeNull();

    // Désormais enrôlé : la clé n'est plus jamais remise.
    const suivante = await http().post('/console/auth/login').send({ email: operateur.email, motDePasse: MOT_DE_PASSE_TEST });
    expect(suivante.body).toEqual({ etape: 'CODE', jetonEtape: expect.any(String) });
  });

  it('refuse un code faux, un code rejoué, et le jeton d’étape sur les routes console', async () => {
    const operateur = await creerOperateur(prisma);
    operateurIds.push(operateur.id);
    const connexion = async () =>
      (await http().post('/console/auth/login').send({ email: operateur.email, motDePasse: MOT_DE_PASSE_TEST })).body
        .jetonEtape as string;

    const jeton = await connexion();
    expect((await http().get('/console/auth/moi').set('Authorization', `Bearer ${jeton}`)).status).toBe(401);
    expect((await http().post('/console/auth/code').send({ jetonEtape: jeton, code: '123456' })).status).toBe(401);
    expect((await http().post('/console/auth/code').send({ jetonEtape: jeton, code: '12345' })).status).toBe(400);

    const code = codeActuel(operateur.totpSecret!);
    expect((await http().post('/console/auth/code').send({ jetonEtape: jeton, code })).status).toBe(200);
    // Même code, nouvelle connexion : refusé (un code ne sert qu'une fois).
    expect((await http().post('/console/auth/code').send({ jetonEtape: await connexion(), code })).status).toBe(401);
  });

  it('refuse un jeton d’étape falsifié ou un jeton de session à la place', async () => {
    const operateur = await creerOperateur(prisma);
    operateurIds.push(operateur.id);
    const session = await connecterOperateur(app, operateur.email);
    const code = codeActuel(operateur.totpSecret!, 1);
    expect((await http().post('/console/auth/code').send({ jetonEtape: session, code })).status).toBe(401);
    const falsifie = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4IiwidHlwIjoiY29uc29sZS1ldGFwZSJ9.c2lnbmF0dXJl';
    expect((await http().post('/console/auth/code').send({ jetonEtape: falsifie, code })).status).toBe(401);
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
