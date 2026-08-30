import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { hashToken } from './token-hash.util.js';

describe('POST /auth/login et /auth/logout (intégration réelle, base PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailsCrees: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterEach(async () => {
    if (emailsCrees.length > 0) {
      const utilisateurs = await prisma.utilisateur.findMany({ where: { email: { in: emailsCrees } } });
      const utilisateurIds = utilisateurs.map((u) => u.id);
      const entrepriseIds = utilisateurs.map((u) => u.entrepriseId);
      await prisma.refreshToken.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
      await prisma.utilisateur.deleteMany({ where: { email: { in: emailsCrees } } });
      await prisma.entreprise.deleteMany({ where: { id: { in: entrepriseIds } } });
      emailsCrees.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function creerCompte() {
    const email = `test-login-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    const password = 'motdepasse-solide-123';
    await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Login',
      nomAdmin: 'Testeur Login',
      email,
      password,
    });
    return { email, password };
  }

  it('connecte un utilisateur avec les bons identifiants et retourne des tokens', async () => {
    const { email, password } = await creerCompte();

    const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
    expect(response.body.utilisateur.email).toBe(email);
  });

  it("rejette avec 401 un email inexistant, avec un message générique", async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'inexistant@stockflow.dev', password: 'peu-importe-123' });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Email ou mot de passe incorrect.');
  });

  it('rejette avec 401 un mauvais mot de passe, avec le même message générique (pas de fuite d’information)', async () => {
    const { email } = await creerCompte();

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'mauvais-mot-de-passe' });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Email ou mot de passe incorrect.');
  });

  it('rejette /auth/logout sans authentification (401)', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: 'peu-importe' });

    expect(response.status).toBe(401);
  });

  it('révoque réellement le refresh token en base lors de la déconnexion', async () => {
    const { email, password } = await creerCompte();
    const loginResponse = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
    const { accessToken, refreshToken } = loginResponse.body;

    const avant = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    expect(avant?.revokedAt).toBeNull();

    const logoutResponse = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(logoutResponse.status).toBe(200);

    const apres = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    expect(apres?.revokedAt).not.toBeNull();
  });

  it('un logout avec un refresh token déjà révoqué ou inexistant reste idempotent (200, pas d’erreur)', async () => {
    const { email, password } = await creerCompte();
    const loginResponse = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
    const { accessToken } = loginResponse.body;

    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken: 'token-qui-n-existe-pas-en-base' });

    expect(response.status).toBe(200);
  });
});
