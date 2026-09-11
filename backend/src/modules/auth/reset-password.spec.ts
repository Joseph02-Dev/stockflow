import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { DevEmailService } from '../../common/email/dev-email.service.js';

describe('Réinitialisation de mot de passe — intégration réelle, base PostgreSQL', () => {
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
      await prisma.reinitialisationMotDePasse.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
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
    const email = `test-reset-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    const password = 'motdepasse-solide-123';
    await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Reset',
      nomAdmin: 'Testeur Reset',
      email,
      password,
    });
    return { email, password };
  }

  it('renvoie le même message de succès, que le compte existe ou non', async () => {
    const { email } = await creerCompte();

    const reponseCompteExistant = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email });
    const reponseCompteInexistant = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'personne-nexiste-pas@stockflow.dev' });

    expect(reponseCompteExistant.status).toBe(200);
    expect(reponseCompteInexistant.status).toBe(200);
    expect(reponseCompteExistant.body.message).toBe(reponseCompteInexistant.body.message);
  });

  it('envoie un email contenant un jeton pour un compte existant', async () => {
    const { email } = await creerCompte();

    await request(app.getHttpServer()).post('/auth/forgot-password').send({ email });

    const emails = devEmail.getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe(email);
    expect(emails[0].body).toContain('token=');
  });

  it('réinitialise le mot de passe avec un jeton valide, et permet de se reconnecter avec le nouveau', async () => {
    const { email } = await creerCompte();
    await request(app.getHttpServer()).post('/auth/forgot-password').send({ email });
    const lien = devEmail.getSentEmails()[0].body;
    const token = lien.match(/token=([a-f0-9]+)/)?.[1];
    expect(token).toBeDefined();

    const reinitialisation = await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, password: 'nouveau-mot-de-passe-456' });
    expect(reinitialisation.status).toBe(200);

    const ancienMotDePasse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'motdepasse-solide-123' });
    expect(ancienMotDePasse.status).toBe(401);

    const nouveauMotDePasse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'nouveau-mot-de-passe-456' });
    expect(nouveauMotDePasse.status).toBe(200);
  });

  it('refuse un jeton déjà utilisé', async () => {
    const { email } = await creerCompte();
    await request(app.getHttpServer()).post('/auth/forgot-password').send({ email });
    const lien = devEmail.getSentEmails()[0].body;
    const token = lien.match(/token=([a-f0-9]+)/)?.[1];

    await request(app.getHttpServer()).post('/auth/reset-password').send({ token, password: 'premier-changement-123' });
    const secondeTentative = await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token, password: 'second-changement-456' });

    expect(secondeTentative.status).toBe(404);
  });

  it('refuse un jeton invalide', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: 'jeton-invente-qui-nexiste-pas', password: 'peu-importe-123' });

    expect(response.status).toBe(404);
  });

  it('révoque les sessions actives lors de la réinitialisation', async () => {
    const { email, password } = await creerCompte();
    const connexion = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
    const refreshTokenActif = connexion.body.refreshToken;

    await request(app.getHttpServer()).post('/auth/forgot-password').send({ email });
    const lien = devEmail.getSentEmails()[0].body;
    const token = lien.match(/token=([a-f0-9]+)/)?.[1];
    await request(app.getHttpServer()).post('/auth/reset-password').send({ token, password: 'nouveau-mdp-789' });

    const tentativeAvecAncienRefresh = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${connexion.body.accessToken}`)
      .send({ refreshToken: refreshTokenActif });
    // logout() est idempotent (200 dans tous les cas), donc on vérifie
    // directement en base que le token a bien été révoqué par le reset.
    expect(tentativeAvecAncienRefresh.status).toBe(200);

    const utilisateur = await prisma.utilisateur.findUniqueOrThrow({ where: { email } });
    const tokensActifs = await prisma.refreshToken.count({
      where: { utilisateurId: utilisateur.id, revokedAt: null },
    });
    expect(tokensActifs).toBe(0);
  });
});
