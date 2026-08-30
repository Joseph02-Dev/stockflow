import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';

describe('Fournisseurs (FOUR-001, FOUR-002) — intégration réelle, base PostgreSQL', () => {
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
      await prisma.alerte.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.mouvement.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.stock.deleteMany({ where: { produit: { entrepriseId: { in: entrepriseIds } } } });
      await prisma.refreshToken.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
      await prisma.utilisateur.deleteMany({ where: { email: { in: emailsCrees } } });
      await prisma.fournisseur.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.produit.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.emplacement.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.entreprise.deleteMany({ where: { id: { in: entrepriseIds } } });
      emailsCrees.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function creerAdmin() {
    const email = `test-four-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    const response = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Fournisseurs',
      nomAdmin: 'Admin Fournisseurs',
      email,
      password: 'motdepasse-solide-123',
    });
    return response.body.accessToken as string;
  }

  it('crée une fiche fournisseur', async () => {
    const accessToken = await creerAdmin();

    const response = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Menuiserie Générale', emailContact: 'contact@menuiserie.fr' });

    expect(response.status).toBe(201);
    expect(response.body.nom).toBe('Menuiserie Générale');
  });

  it('rejette avec 400 un email de contact invalide', async () => {
    const accessToken = await creerAdmin();

    const response = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Fournisseur Invalide', emailContact: 'pas-un-email' });

    expect(response.status).toBe(400);
  });

  it('associe un produit à un fournisseur', async () => {
    const accessToken = await creerAdmin();
    const fournisseur = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Fournisseur A' });
    const produit = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit A' });

    const association = await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseur.body.id}/produits`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produit.body.id });
    expect(association.status).toBe(201);

    const produitsAssocies = await request(app.getHttpServer())
      .get(`/fournisseurs/${fournisseur.body.id}/produits`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(produitsAssocies.body).toHaveLength(1);
    expect(produitsAssocies.body[0].id).toBe(produit.body.id);
  });

  it('rejette avec 409 une association déjà existante', async () => {
    const accessToken = await creerAdmin();
    const fournisseur = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Fournisseur B' });
    const produit = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit B' });

    await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseur.body.id}/produits`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produit.body.id });
    const second = await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseur.body.id}/produits`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produit.body.id });

    expect(second.status).toBe(409);
  });

  it('dissocie un produit', async () => {
    const accessToken = await creerAdmin();
    const fournisseur = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Fournisseur C' });
    const produit = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit C' });
    await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseur.body.id}/produits`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produit.body.id });

    const dissociation = await request(app.getHttpServer())
      .delete(`/fournisseurs/${fournisseur.body.id}/produits/${produit.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(dissociation.status).toBe(200);

    const produitsAssocies = await request(app.getHttpServer())
      .get(`/fournisseurs/${fournisseur.body.id}/produits`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(produitsAssocies.body).toHaveLength(0);
  });

  it("rejette avec 404 l'association d'un produit d'une autre entreprise", async () => {
    const accessTokenA = await creerAdmin();
    const accessTokenB = await creerAdmin();
    const fournisseurDeA = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set('Authorization', `Bearer ${accessTokenA}`)
      .send({ nom: 'Fournisseur de A' });
    const produitDeB = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessTokenB}`)
      .send({ nom: 'Produit de B' });

    const tentative = await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseurDeA.body.id}/produits`)
      .set('Authorization', `Bearer ${accessTokenA}`)
      .send({ produitId: produitDeB.body.id });

    expect(tentative.status).toBe(404);
  });

  it("rejette avec 404 l'accès à un fournisseur d'une autre entreprise", async () => {
    const accessTokenA = await creerAdmin();
    const accessTokenB = await creerAdmin();
    const fournisseurDeB = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set('Authorization', `Bearer ${accessTokenB}`)
      .send({ nom: 'Fournisseur de B' });

    const tentative = await request(app.getHttpServer())
      .get(`/fournisseurs/${fournisseurDeB.body.id}`)
      .set('Authorization', `Bearer ${accessTokenA}`);

    expect(tentative.status).toBe(404);
  });

  // FOUR-003 — Historique des réceptions

  it("l'historique des réceptions liste les entrées de stock du fournisseur", async () => {
    const accessToken = await creerAdmin();
    const fournisseur = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Fournisseur Réceptions' });
    const produit = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit Réception' });
    const emplacement = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Entrepôt Réception' });

    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        produitId: produit.body.id,
        emplacementId: emplacement.body.id,
        quantite: 25,
        fournisseurId: fournisseur.body.id,
      });

    const response = await request(app.getHttpServer())
      .get(`/fournisseurs/${fournisseur.body.id}/receptions`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].quantite).toBe(25);
    expect(response.body[0].type).toBe('ENTREE');
    expect(response.body[0].produit.nom).toBe('Produit Réception');
  });

  it("l'historique exclut les entrées non rattachées à ce fournisseur et les sorties", async () => {
    const accessToken = await creerAdmin();
    const fournisseur = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Fournisseur Filtré' });
    const produit = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit Filtré' });
    const emplacement = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Entrepôt Filtré' });

    // Entrée SANS fournisseur : ne doit pas apparaître.
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produit.body.id, emplacementId: emplacement.body.id, quantite: 100 });
    // Sortie : ne doit jamais apparaître dans les réceptions.
    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produit.body.id, emplacementId: emplacement.body.id, quantite: 5 });

    const response = await request(app.getHttpServer())
      .get(`/fournisseurs/${fournisseur.body.id}/receptions`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(0);
  });

  it("rejette avec 404 l'historique des réceptions d'un fournisseur d'une autre entreprise", async () => {
    const accessTokenA = await creerAdmin();
    const accessTokenB = await creerAdmin();
    const fournisseurDeB = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set('Authorization', `Bearer ${accessTokenB}`)
      .send({ nom: 'Fournisseur B Réceptions' });

    const tentative = await request(app.getHttpServer())
      .get(`/fournisseurs/${fournisseurDeB.body.id}/receptions`)
      .set('Authorization', `Bearer ${accessTokenA}`);

    expect(tentative.status).toBe(404);
  });
});
