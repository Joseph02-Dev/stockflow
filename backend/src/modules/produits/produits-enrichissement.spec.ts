import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';

describe('Produits — champs enrichis (prix, TVA, code-barre, catégorie, marque)', () => {
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
      await prisma.fournisseurProduit.deleteMany({
        where: { fournisseur: { entrepriseId: { in: entrepriseIds } } },
      });
      await prisma.fournisseur.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.produit.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.categorie.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.marque.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
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
    const email = `test-prod-enrichi-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    const response = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Enrichie',
      nomAdmin: 'Admin Enrichi',
      email,
      password: 'motdepasse-solide-123',
    });
    return response.body.accessToken as string;
  }

  it('crée un produit avec tous les champs enrichis', async () => {
    const accessToken = await creerAdmin();
    const categorie = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Visserie' });
    const marque = await request(app.getHttpServer())
      .post('/marques')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Bosch' });

    const response = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nom: 'Perceuse sans fil',
        prixAchat: 350000,
        prixVente: 495000,
        tauxTva: 18,
        codeBarre: '3401234567890',
        description: 'Perceuse-visseuse sans fil 18V avec deux batteries.',
        categorieId: categorie.body.id,
        marqueId: marque.body.id,
        photoUrl: 'https://res.cloudinary.com/demo/image/upload/perceuse.jpg',
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      prixAchat: 350000,
      prixVente: 495000,
      tauxTva: 18,
      codeBarre: '3401234567890',
    });
    expect(response.body.categorie.nom).toBe('Visserie');
    expect(response.body.marque.nom).toBe('Bosch');
  });

  it('crée un produit sans aucun champ enrichi (tous facultatifs)', async () => {
    const accessToken = await creerAdmin();

    const response = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit minimal' });

    expect(response.status).toBe(201);
    expect(response.body.prixAchat).toBeNull();
    expect(response.body.categorie).toBeNull();
  });

  it('rejette avec 400 un taux de TVA supérieur à 100', async () => {
    const accessToken = await creerAdmin();

    const response = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit TVA invalide', tauxTva: 150 });

    expect(response.status).toBe(400);
  });

  it('rejette avec 400 un prix négatif', async () => {
    const accessToken = await creerAdmin();

    const response = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit prix invalide', prixVente: -100 });

    expect(response.status).toBe(400);
  });

  it('rejette avec 409 un code-barre déjà utilisé dans la même entreprise', async () => {
    const accessToken = await creerAdmin();
    await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit A', codeBarre: '1111111111111' });

    const second = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit B', codeBarre: '1111111111111' });

    expect(second.status).toBe(409);
  });

  it('autorise le même code-barre dans deux entreprises différentes', async () => {
    const accessTokenA = await creerAdmin();
    const accessTokenB = await creerAdmin();
    await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .send({ nom: 'Produit chez A', codeBarre: '2222222222222' });

    const response = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessTokenB}`)
      .send({ nom: 'Produit chez B', codeBarre: '2222222222222' });

    expect(response.status).toBe(201);
  });

  it("rejette avec 404 l'association d'une catégorie d'une autre entreprise", async () => {
    const accessTokenA = await creerAdmin();
    const accessTokenB = await creerAdmin();
    const categorieDeB = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${accessTokenB}`)
      .send({ nom: 'Catégorie de B' });

    const response = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .send({ nom: 'Tentative', categorieId: categorieDeB.body.id });

    expect(response.status).toBe(404);
  });

  it('permet de modifier les champs enrichis existants', async () => {
    const accessToken = await creerAdmin();
    const creation = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit à modifier', prixVente: 10000 });

    const response = await request(app.getHttpServer())
      .patch(`/produits/${creation.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ prixVente: 15000, description: 'Nouvelle description' });

    expect(response.status).toBe(200);
    expect(response.body.prixVente).toBe(15000);
    expect(response.body.description).toBe('Nouvelle description');
  });

  it('GET /produits/:id retourne le produit avec sa catégorie et sa marque', async () => {
    const accessToken = await creerAdmin();
    const categorie = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Test Détail' });
    const creation = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit Détail', categorieId: categorie.body.id });

    const response = await request(app.getHttpServer())
      .get(`/produits/${creation.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.categorie.nom).toBe('Test Détail');
  });

  it('GET /produits/:id inclut les fournisseurs associés', async () => {
    const accessToken = await creerAdmin();
    const fournisseur = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Fournisseur Détail' });
    const creation = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit Avec Fournisseur' });
    await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseur.body.id}/produits`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: creation.body.id });

    const response = await request(app.getHttpServer())
      .get(`/produits/${creation.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.fournisseursAssocies).toHaveLength(1);
    expect(response.body.fournisseursAssocies[0].fournisseur.nom).toBe('Fournisseur Détail');
  });
});
