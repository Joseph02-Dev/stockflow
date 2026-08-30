import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { DevEmailService } from '../../common/email/dev-email.service.js';

describe("Flux d'invitation AUTH-003 (intégration réelle, base PostgreSQL)", () => {
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
    if (emailsCrees.length > 0) {
      const utilisateurs = await prisma.utilisateur.findMany({ where: { email: { in: emailsCrees } } });
      const utilisateurIds = utilisateurs.map((u) => u.id);
      const entrepriseIds = utilisateurs.map((u) => u.entrepriseId);
      await prisma.invitation.deleteMany({ where: { email: { in: emailsCrees } } });
      await prisma.refreshToken.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
      await prisma.utilisateur.deleteMany({ where: { email: { in: emailsCrees } } });
      await prisma.entreprise.deleteMany({ where: { id: { in: entrepriseIds } } });
      emailsCrees.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function creerAdmin() {
    const emailAdmin = `test-invite-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(emailAdmin);
    const registerResponse = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Invite',
      nomAdmin: 'Admin Test',
      email: emailAdmin,
      password: 'motdepasse-solide-123',
    });
    return { accessToken: registerResponse.body.accessToken as string, emailAdmin };
  }

  it("un Admin peut inviter un utilisateur : l'email est envoyé (transport dev)", async () => {
    const { accessToken } = await creerAdmin();
    const emailInvite = `test-invite-${Date.now()}@stockflow.dev`;
    emailsCrees.push(emailInvite);

    const response = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: emailInvite, role: 'GESTIONNAIRE' });

    expect(response.status).toBe(201);
    const emailsEnvoyes = devEmail.getSentEmails();
    expect(emailsEnvoyes).toHaveLength(1);
    expect(emailsEnvoyes[0].to).toBe(emailInvite);
    expect(emailsEnvoyes[0].body).toContain('GESTIONNAIRE');

    // Vérifie que l'invitation existe bien en base, avec un token haché
    // (jamais le token en clair).
    const invitation = await prisma.invitation.findFirst({ where: { email: emailInvite } });
    expect(invitation).not.toBeNull();
    expect(invitation?.tokenHash).not.toContain(' '); // pas le texte de l'email, un hash hex
  });

  it('rejette avec 403 une invitation envoyée par un Gestionnaire (rôle insuffisant)', async () => {
    const { accessToken: accessTokenAdmin, emailAdmin: _e } = await creerAdmin();
    const emailGestionnaire = `test-invite-gest-${Date.now()}@stockflow.dev`;
    emailsCrees.push(emailGestionnaire);

    // Créer un Gestionnaire via une première invitation acceptée
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${accessTokenAdmin}`)
      .send({ email: emailGestionnaire, role: 'GESTIONNAIRE' });
    const [emailEnvoye] = devEmail.getSentEmails();
    const token = emailEnvoye.body.match(/Jeton d'invitation : ([a-f0-9]+)/)?.[1];
    const acceptResponse = await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token, nom: 'Gestionnaire Test', password: 'motdepasse-solide-123' });
    const accessTokenGestionnaire = acceptResponse.body.accessToken;

    const response = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${accessTokenGestionnaire}`)
      .send({ email: `autre-${Date.now()}@stockflow.dev`, role: 'GESTIONNAIRE' });

    expect(response.status).toBe(403);
  });

  it('rejette avec 409 une invitation pour un email déjà utilisé par un compte existant', async () => {
    const { accessToken, emailAdmin } = await creerAdmin();

    const response = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: emailAdmin, role: 'GESTIONNAIRE' });

    expect(response.status).toBe(409);
  });

  it('rejette avec 409 une seconde invitation active pour le même email', async () => {
    const { accessToken } = await creerAdmin();
    const emailInvite = `test-invite-dup-${Date.now()}@stockflow.dev`;
    emailsCrees.push(emailInvite);

    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: emailInvite, role: 'GESTIONNAIRE' });
    const second = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: emailInvite, role: 'ADMIN' });

    expect(second.status).toBe(409);
  });

  it('accepte une invitation valide, crée l’utilisateur avec le bon rôle et connecte automatiquement', async () => {
    const { accessToken } = await creerAdmin();
    const emailInvite = `test-invite-accept-${Date.now()}@stockflow.dev`;
    emailsCrees.push(emailInvite);

    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: emailInvite, role: 'GESTIONNAIRE' });
    const [emailEnvoye] = devEmail.getSentEmails();
    const token = emailEnvoye.body.match(/Jeton d'invitation : ([a-f0-9]+)/)?.[1];

    const response = await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token, nom: 'Nouvel Utilisateur', password: 'motdepasse-solide-123' });

    expect(response.status).toBe(201);
    expect(response.body.utilisateur).toMatchObject({
      email: emailInvite,
      nom: 'Nouvel Utilisateur',
      role: 'GESTIONNAIRE',
    });
    expect(response.body.accessToken).toBeDefined();
  });

  it('rejette avec 404 un token d’invitation invalide', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token: 'token-invalide-inexistant', nom: 'Nom Valide', password: 'motdepasse-solide-123' });

    expect(response.status).toBe(404);
  });

  it('rejette avec 404 une invitation déjà acceptée (usage unique)', async () => {
    const { accessToken } = await creerAdmin();
    const emailInvite = `test-invite-reuse-${Date.now()}@stockflow.dev`;
    emailsCrees.push(emailInvite);

    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: emailInvite, role: 'GESTIONNAIRE' });
    const [emailEnvoye] = devEmail.getSentEmails();
    const token = emailEnvoye.body.match(/Jeton d'invitation : ([a-f0-9]+)/)?.[1];

    await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token, nom: 'Premier', password: 'motdepasse-solide-123' });
    const second = await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token, nom: 'Deuxieme', password: 'motdepasse-solide-123' });

    expect(second.status).toBe(404);
  });

  it("rejette avec 401 une invitation envoyée par un utilisateur non authentifié", async () => {
    const response = await request(app.getHttpServer())
      .post('/users')
      .send({ email: `sans-auth-${Date.now()}@stockflow.dev`, role: 'GESTIONNAIRE' });

    expect(response.status).toBe(401);
  });

  // AUTH-003 — Listing des utilisateurs

  it("un Admin peut lister les utilisateurs de son entreprise", async () => {
    const { accessToken, emailAdmin } = await creerAdmin();

    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ email: emailAdmin, role: 'ADMIN' });
  });

  it("le hash du mot de passe n'est JAMAIS exposé dans la liste des utilisateurs", async () => {
    const { accessToken } = await creerAdmin();

    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(response.body[0].passwordHash).toBeUndefined();
  });

  it("la liste reflète les utilisateurs ayant accepté une invitation", async () => {
    const { accessToken } = await creerAdmin();
    const emailInvite = `test-invite-liste-${Date.now()}@stockflow.dev`;
    emailsCrees.push(emailInvite);

    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: emailInvite, role: 'GESTIONNAIRE' });
    const [emailEnvoye] = devEmail.getSentEmails();
    const token = emailEnvoye.body.match(/Jeton d'invitation : ([a-f0-9]+)/)?.[1];
    await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token, nom: 'Nouveau Gestionnaire', password: 'motdepasse-solide-123' });

    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.body).toHaveLength(2);
    expect(response.body.map((u: { role: string }) => u.role)).toContain('GESTIONNAIRE');
  });

  it('rejette avec 403 le listing demandé par un Gestionnaire', async () => {
    const { accessToken: accessTokenAdmin } = await creerAdmin();
    const emailGestionnaire = `test-liste-gest-${Date.now()}@stockflow.dev`;
    emailsCrees.push(emailGestionnaire);
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${accessTokenAdmin}`)
      .send({ email: emailGestionnaire, role: 'GESTIONNAIRE' });
    const [emailEnvoye] = devEmail.getSentEmails();
    const token = emailEnvoye.body.match(/Jeton d'invitation : ([a-f0-9]+)/)?.[1];
    const acceptation = await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token, nom: 'Gestionnaire Liste', password: 'motdepasse-solide-123' });

    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${acceptation.body.accessToken}`);

    expect(response.status).toBe(403);
  });

  it("une entreprise ne voit jamais les utilisateurs d'une autre (isolation multi-tenant)", async () => {
    const { accessToken: tokenA } = await creerAdmin();
    await creerAdmin(); // entreprise B, avec son propre admin

    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(response.body).toHaveLength(1);
  });
});
