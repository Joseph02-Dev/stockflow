import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { hashToken } from './token-hash.util.js';
import { refreshTokenDe } from '../console/console-test.utils.js';

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
      await prisma.verificationEmail.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
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
    // Ce fichier teste connexion/déconnexion/verrouillage, pas le
    // parcours de double opt-in (qui a ses propres tests dédiés dans
    // auth.controller.spec.ts) : le compte est vérifié directement en
    // base pour pouvoir se connecter.
    await prisma.utilisateur.update({ where: { email }, data: { emailVerifieAt: new Date() } });
    return { email, password };
  }

  it('connecte un utilisateur avec les bons identifiants et retourne des tokens', async () => {
    const { email, password } = await creerCompte();

    const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    // Refresh token : cookie httpOnly seulement, jamais dans le corps.
    expect(response.body.refreshToken).toBeUndefined();
    expect(refreshTokenDe(response)).toBeTruthy();
    expect(response.body.utilisateur.email).toBe(email);
  });

  it("rejette avec 401 un email inexistant, avec un message générique", async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'inexistant@stockflow.dev', password: 'peu-importe-123' });

    expect(response.status).toBe(401);
    // Même message qu'un mauvais mot de passe sur un compte existant (SEC-04).
    expect(response.body.message).toBe(
      'Email ou mot de passe incorrect. 4 tentatives restantes avant blocage temporaire de 15 minutes.',
    );
  });

  it('rejette avec 401 un mauvais mot de passe, sans révéler lequel des deux champs est en cause', async () => {
    const { email } = await creerCompte();

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'mauvais-mot-de-passe' });

    expect(response.status).toBe(401);
    expect(response.body.message).toContain('Email ou mot de passe incorrect.');
    expect(response.body.message).toContain('tentative');
  });

  it('email inconnu ou compte existant : mêmes réponses, dans le même ordre, jusqu’au blocage', async () => {
    const { email } = await creerCompte();
    const inconnu = `inconnu-${Date.now()}@stockflow.dev`;
    const essai = async (adresse: string) => {
      const r = await request(app.getHttpServer()).post('/auth/login').send({ email: adresse, password: 'mauvais-mot-de-passe' });
      return `${r.status} ${r.body.message}`;
    };
    for (let i = 0; i < 6; i++) {
      expect(await essai(inconnu)).toBe(await essai(email));
    }
    expect(await essai(inconnu)).toMatch(/^401 Compte temporairement bloqué .* Réessayez dans 15 minute\(s\)\.$/);
  });

  it('email inconnu : réponse aussi lente qu’un mauvais mot de passe (argon2 calculé)', async () => {
    const { email } = await creerCompte();
    const duree = async (adresse: string) => {
      const debut = performance.now();
      await request(app.getHttpServer()).post('/auth/login').send({ email: adresse, password: 'mauvais-mot-de-passe' });
      return performance.now() - debut;
    };
    await duree(`chauffe-${Date.now()}@stockflow.dev`);
    const mediane = async (adresse: () => string) => {
      const mesures: number[] = [];
      for (let i = 0; i < 3; i++) mesures.push(await duree(adresse()));
      return mesures.sort((a, b) => a - b)[1];
    };
    const inconnu = await mediane(() => `inconnu-${Date.now()}-${Math.random()}@stockflow.dev`);
    const existant = await mediane(() => email);
    // Sans le calcul factice, un email inconnu répondait plus de 10 fois plus vite.
    expect(inconnu).toBeGreaterThan(existant * 0.5);
  });

  it('bloque temporairement le compte après 5 échecs consécutifs', async () => {
    const { email, password } = await creerCompte();

    for (let i = 0; i < 4; i++) {
      await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'mauvais-mot-de-passe' });
    }
    const cinquiemeEchec = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'mauvais-mot-de-passe' });
    expect(cinquiemeEchec.status).toBe(401);
    expect(cinquiemeEchec.body.message).toContain('bloqué');

    // Même avec le bon mot de passe, le compte reste bloqué.
    const avecBonMotDePasse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    expect(avecBonMotDePasse.status).toBe(401);
    expect(avecBonMotDePasse.body.message).toContain('bloqué');
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
    const { accessToken } = loginResponse.body;
    const refreshToken = refreshTokenDe(loginResponse);

    const avant = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
    expect(avant?.revokedAt).toBeNull();

    const logoutResponse = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', `stockflow_refresh=${refreshToken}`);

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
