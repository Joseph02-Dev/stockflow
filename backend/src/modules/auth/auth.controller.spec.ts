import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { DevEmailService } from '../../common/email/dev-email.service.js';

describe('POST /auth/register (intégration réelle, base PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let devEmail: DevEmailService;
  const emailsCrees: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    devEmail = moduleRef.get(DevEmailService);
  });

  afterEach(async () => {
    devEmail.clear();
    // Nettoyage : supprime les données créées par ce fichier de test pour
    // rester idempotent (rejouable sans collision d'email unique).
    if (emailsCrees.length > 0) {
      const utilisateurs = await prisma.utilisateur.findMany({ where: { email: { in: emailsCrees } } });
      const utilisateurIds = utilisateurs.map((u) => u.id);
      const entrepriseIds = utilisateurs.map((u) => u.entrepriseId);
      await prisma.verificationEmail.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
      await prisma.refreshToken.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
      await prisma.utilisateur.deleteMany({ where: { email: { in: emailsCrees } } });
      await prisma.entreprise.deleteMany({ where: { id: { in: entrepriseIds } } });
      emailsCrees.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('crée une entreprise + un admin inactif, et envoie un email de confirmation (double opt-in)', async () => {
    const email = `test-auth-${Date.now()}@stockflow.dev`;
    emailsCrees.push(email);

    const response = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Menuiserie Dupont',
      nomAdmin: 'Alice Dupont',
      email,
      password: 'motdepasse-solide-123',
    });

    expect(response.status).toBe(201);
    // Ne renvoie plus de tokens : le compte n'est pas actif tant que
    // l'email n'a pas été confirmé (décision validée).
    expect(response.body.accessToken).toBeUndefined();
    expect(response.body.message).toBeDefined();
    // Le mot de passe ne doit JAMAIS apparaître dans la réponse.
    expect(JSON.stringify(response.body)).not.toContain('motdepasse-solide-123');

    const utilisateur = await prisma.utilisateur.findUniqueOrThrow({ where: { email } });
    expect(utilisateur.emailVerifieAt).toBeNull();
    expect(utilisateur.role).toBe('ADMIN');

    const emails = devEmail.getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe(email);
    expect(emails[0].body).toContain('verifier-email?token=');
  });

  it('refuse la connexion tant que l’email n’est pas confirmé', async () => {
    const email = `test-auth-nonverif-${Date.now()}@stockflow.dev`;
    emailsCrees.push(email);
    await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Non Vérifiée',
      nomAdmin: 'Testeur',
      email,
      password: 'motdepasse-solide-123',
    });

    const connexion = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'motdepasse-solide-123' });

    expect(connexion.status).toBe(401);
    expect(connexion.body.message).toContain('Confirmez votre adresse email');
  });

  it('active le compte et connecte automatiquement après clic sur le lien de confirmation', async () => {
    const email = `test-auth-verif-${Date.now()}@stockflow.dev`;
    emailsCrees.push(email);
    await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Vérifiée',
      nomAdmin: 'Testeur',
      email,
      password: 'motdepasse-solide-123',
    });
    const lien = devEmail.getSentEmails()[0].body;
    const token = lien.match(/token=([a-f0-9]+)/)?.[1];
    expect(token).toBeDefined();

    const verification = await request(app.getHttpServer()).post('/auth/verify-email').send({ token });
    expect(verification.status).toBe(200);
    expect(verification.body.accessToken).toBeDefined();

    const connexion = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'motdepasse-solide-123' });
    expect(connexion.status).toBe(200);
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

  it('rejette avec 400 un domaine email inexistant (pas d’enregistrement MX)', async () => {
    const response = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Test',
      nomAdmin: 'Testeur',
      email: `test-${Date.now()}@ce-domaine-nexiste-vraiment-pas-xyz123.com`,
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
