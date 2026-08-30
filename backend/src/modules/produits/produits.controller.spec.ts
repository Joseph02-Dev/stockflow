import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';

describe('Produits (PROD-001 à PROD-004) — intégration réelle, base PostgreSQL', () => {
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
      await prisma.produit.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.entreprise.deleteMany({ where: { id: { in: entrepriseIds } } });
      emailsCrees.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function creerAdmin() {
    const email = `test-prod-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    const response = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Produits',
      nomAdmin: 'Admin Produits',
      email,
      password: 'motdepasse-solide-123',
    });
    return response.body.accessToken as string;
  }

  it('crée un produit avec un seuil par défaut à 0 si non précisé', async () => {
    const accessToken = await creerAdmin();

    const response = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Chaise de bureau ergonomique', reference: 'CH-001' });

    expect(response.status).toBe(201);
    expect(response.body.nom).toBe('Chaise de bureau ergonomique');
    expect(response.body.seuilAlerte).toBe(0);
    expect(response.body.archive).toBe(false);
  });

  it('crée un produit avec un seuil explicite', async () => {
    const accessToken = await creerAdmin();

    const response = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Ramette de papier A4', seuilAlerte: 10 });

    expect(response.status).toBe(201);
    expect(response.body.seuilAlerte).toBe(10);
  });

  it('rejette avec 400 un seuil négatif', async () => {
    const accessToken = await creerAdmin();

    const response = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit Invalide', seuilAlerte: -5 });

    expect(response.status).toBe(400);
  });

  it('recherche les produits par nom, insensible à la casse', async () => {
    const accessToken = await creerAdmin();
    await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Chaise de bureau' });
    await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Table basse' });

    const response = await request(app.getHttpServer())
      .get('/produits?search=CHAISE')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].nom).toBe('Chaise de bureau');
  });

  it('modifie un produit', async () => {
    const accessToken = await creerAdmin();
    const creation = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Nom initial', seuilAlerte: 5 });

    const response = await request(app.getHttpServer())
      .patch(`/produits/${creation.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Nom corrigé', seuilAlerte: 20 });

    expect(response.status).toBe(200);
    expect(response.body.nom).toBe('Nom corrigé');
    expect(response.body.seuilAlerte).toBe(20);
  });

  it("l'archivage masque le produit de la liste par défaut sans le supprimer", async () => {
    const accessToken = await creerAdmin();
    const creation = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'À archiver' });

    const archivage = await request(app.getHttpServer())
      .patch(`/produits/${creation.body.id}/archive`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(archivage.status).toBe(200);
    expect(archivage.body.archive).toBe(true);

    const listeParDefaut = await request(app.getHttpServer())
      .get('/produits')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listeParDefaut.body).toHaveLength(0);

    const produitEnBase = await prisma.produit.findUnique({ where: { id: creation.body.id } });
    expect(produitEnBase).not.toBeNull(); // toujours présent en base, juste archivé
  });

  it("rejette avec 404 la modification d'un produit appartenant à une autre entreprise (isolation multi-tenant)", async () => {
    const accessTokenA = await creerAdmin();
    const accessTokenB = await creerAdmin();

    const produitDeB = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessTokenB}`)
      .send({ nom: 'Produit de B' });

    const tentative = await request(app.getHttpServer())
      .patch(`/produits/${produitDeB.body.id}`)
      .set('Authorization', `Bearer ${accessTokenA}`)
      .send({ nom: 'Tentative illégitime' });

    expect(tentative.status).toBe(404);
  });

  it('rejette avec 401 une requête sans authentification', async () => {
    const response = await request(app.getHttpServer()).get('/produits');
    expect(response.status).toBe(401);
  });
});
