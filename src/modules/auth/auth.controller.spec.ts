import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';

describe('POST /auth/register (intégration réelle, base PostgreSQL)', () => {
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
    // Nettoyage : supprime les données créées par ce fichier de test pour
    // rester idempotent (rejouable sans collision d'email unique).
    if (emailsCrees.length > 0) {
      const utilisateurs = await prisma.utilisateur.findMany({ where: { email: { in: emailsCrees } } });
      const entrepriseIds = utilisateurs.map((u) => u.entrepriseId);
      await prisma.utilisateur.deleteMany({ where: { email: { in: emailsCrees } } });
      await prisma.entreprise.deleteMany({ where: { id: { in: entrepriseIds } } });
      emailsCrees.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('crée une entreprise + un admin, et retourne des tokens', async () => {
    const email = `test-auth-${Date.now()}@stockflow.dev`;
    emailsCrees.push(email);

    const response = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Menuiserie Dupont',
      nomAdmin: 'Alice Dupont',
      email,
      password: 'motdepasse-solide-123',
    });

    expect(response.status).toBe(201);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
    expect(response.body.utilisateur).toMatchObject({ email, nom: 'Alice Dupont', role: 'ADMIN' });
    expect(response.body.entreprise).toMatchObject({ nom: 'Menuiserie Dupont' });
    // Le mot de passe ne doit JAMAIS apparaître dans la réponse.
    expect(JSON.stringify(response.body)).not.toContain('motdepasse-solide-123');
  });

  it('hash réellement le mot de passe en base (jamais stocké en clair)', async () => {
    const email = `test-auth-hash-${Date.now()}@stockflow.dev`;
    emailsCrees.push(email);

    await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Test Hash',
      nomAdmin: 'Bob',
      email,
      password: 'motdepasse-solide-123',
    });

    const utilisateur = await prisma.utilisateur.findUniqueOrThrow({ where: { email } });
    expect(utilisateur.passwordHash).not.toBe('motdepasse-solide-123');
    expect(await argon2.verify(utilisateur.passwordHash, 'motdepasse-solide-123')).toBe(true);
  });

  it('rejette avec 409 un email déjà utilisé', async () => {
    const email = `test-auth-dup-${Date.now()}@stockflow.dev`;
    emailsCrees.push(email);
    const payload = { nomEntreprise: 'Entreprise Test', nomAdmin: 'Testeur', email, password: 'motdepasse-solide-123' };

    await request(app.getHttpServer()).post('/auth/register').send(payload);
    const second = await request(app.getHttpServer()).post('/auth/register').send(payload);

    expect(second.status).toBe(409);
  });

  it('rejette avec 400 un email invalide', async () => {
    const response = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Test',
      nomAdmin: 'Testeur',
      email: 'pas-un-email',
      password: 'motdepasse-solide-123',
    });

    expect(response.status).toBe(400);
  });

  it('rejette avec 400 un mot de passe trop court', async () => {
    const response = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Test',
      nomAdmin: 'Testeur',
      email: `test-auth-short-${Date.now()}@stockflow.dev`,
      password: '123',
    });

    expect(response.status).toBe(400);
  });

  it("rejette avec 400 un champ non attendu (whitelist stricte)", async () => {
    const response = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Test',
      nomAdmin: 'Testeur',
      email: `test-auth-extra-${Date.now()}@stockflow.dev`,
      password: 'motdepasse-solide-123',
      entrepriseId: 'ent-usurpee', // tentative d'injection d'un champ non prévu
    });

    expect(response.status).toBe(400);
  });
});
