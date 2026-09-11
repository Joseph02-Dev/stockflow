import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { DevEmailService } from '../../common/email/dev-email.service.js';

describe('Catégories — intégration réelle, base PostgreSQL', () => {
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
      await prisma.produit.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.categorie.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.invitation.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
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

  async function creerAdmin() {
    const email = `test-categorie-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Catégories',
      nomAdmin: 'Admin Catégories',
      email,
      password: 'motdepasse-solide-123',
    });
    // Compte vérifié directement en base plutôt que de passer par le
    // vrai lien de confirmation : ce test porte sur autre chose que le
    // parcours de vérification d'email, qui a ses propres tests dédiés.
    await prisma.utilisateur.update({ where: { email }, data: { emailVerifieAt: new Date() } });
    const connexion = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'motdepasse-solide-123' });
    return connexion.body.accessToken as string;
  }

  /** Crée un vrai utilisateur Gestionnaire (invitation + acceptation). */
  async function creerGestionnaire(accessTokenAdmin: string) {
    const email = `test-categorie-gest-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    devEmail.clear();
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${accessTokenAdmin}`)
      .send({ email, role: 'GESTIONNAIRE' });
    const [emailEnvoye] = devEmail.getSentEmails();
    const token = emailEnvoye.body.match(/Jeton d'invitation : ([a-f0-9]+)/)?.[1];
    const acceptation = await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token, nom: 'Gestionnaire Test', password: 'motdepasse-solide-123' });
    return acceptation.body.accessToken as string;
  }

  it('un Admin peut créer une catégorie', async () => {
    const accessToken = await creerAdmin();

    const response = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Quincaillerie' });

    expect(response.status).toBe(201);
    expect(response.body.nom).toBe('Quincaillerie');
  });

  it('rejette avec 409 une catégorie du même nom déjà existante', async () => {
    const accessToken = await creerAdmin();
    await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Bois' });

    const second = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Bois' });

    expect(second.status).toBe(409);
  });

  it('rejette avec 403 la création tentée par un Gestionnaire', async () => {
    const accessTokenAdmin = await creerAdmin();
    const accessTokenGestionnaire = await creerGestionnaire(accessTokenAdmin);

    const response = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${accessTokenGestionnaire}`)
      .send({ nom: 'Tentative Non Autorisée' });

    expect(response.status).toBe(403);
  });

  it('un Gestionnaire peut lire la liste des catégories (lecture non restreinte)', async () => {
    const accessTokenAdmin = await creerAdmin();
    await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${accessTokenAdmin}`)
      .send({ nom: 'Outillage' });
    const accessTokenGestionnaire = await creerGestionnaire(accessTokenAdmin);

    const response = await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', `Bearer ${accessTokenGestionnaire}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
  });

  it('refuse de supprimer une catégorie encore utilisée par un produit', async () => {
    const accessToken = await creerAdmin();
    const categorie = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Électricité' });
    await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Câble électrique', categorieId: categorie.body.id });

    const suppression = await request(app.getHttpServer())
      .delete(`/categories/${categorie.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(suppression.status).toBe(409);
  });

  it('supprime une catégorie non utilisée', async () => {
    const accessToken = await creerAdmin();
    const categorie = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Peinture' });

    const suppression = await request(app.getHttpServer())
      .delete(`/categories/${categorie.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(suppression.status).toBe(200);
  });

  it("isolation multi-tenant : une entreprise ne voit jamais les catégories d'une autre", async () => {
    const accessTokenA = await creerAdmin();
    const accessTokenB = await creerAdmin();
    await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${accessTokenB}`)
      .send({ nom: 'Catégorie de B' });

    const listeA = await request(app.getHttpServer())
      .get('/categories')
      .set('Authorization', `Bearer ${accessTokenA}`);

    expect(listeA.body).toHaveLength(0);
  });
});
