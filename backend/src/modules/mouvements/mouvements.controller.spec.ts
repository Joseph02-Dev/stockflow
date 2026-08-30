import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';

describe('Mouvements de stock (MVT-001 à MVT-004) — intégration réelle, base PostgreSQL', () => {
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
      await prisma.alerte.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.mouvement.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.stock.deleteMany({ where: { produit: { entrepriseId: { in: entrepriseIds } } } });
      await prisma.refreshToken.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
      await prisma.utilisateur.deleteMany({ where: { email: { in: emailsCrees } } });
      await prisma.produit.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.emplacement.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.entreprise.deleteMany({ where: { id: { in: entrepriseIds } } });
      emailsCrees.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function creerContexte(seuilAlerte = 0) {
    const email = `test-mvt-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    const registerResponse = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Mouvements',
      nomAdmin: 'Admin Mouvements',
      email,
      password: 'motdepasse-solide-123',
    });
    const accessToken = registerResponse.body.accessToken as string;

    const produit = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit Test', seuilAlerte });
    const emplacement = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Entrepôt Test' });

    return { accessToken, produitId: produit.body.id as string, emplacementId: emplacement.body.id as string };
  }

  it('une entrée de stock augmente le stock et crée un mouvement', async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte();

    const response = await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 50 });

    expect(response.status).toBe(201);
    expect(response.body.type).toBe('ENTREE');
    expect(response.body.quantite).toBe(50);

    const stock = await prisma.stock.findUnique({
      where: { produitId_emplacementId: { produitId, emplacementId } },
    });
    expect(stock?.quantite).toBe(50);
  });

  it('deux entrées successives cumulent correctement le stock', async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte();

    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 30 });
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 20 });

    const stock = await prisma.stock.findUnique({
      where: { produitId_emplacementId: { produitId, emplacementId } },
    });
    expect(stock?.quantite).toBe(50);
  });

  it('une sortie diminue le stock', async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 50 });

    const response = await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 20 });

    expect(response.status).toBe(201);
    const stock = await prisma.stock.findUnique({
      where: { produitId_emplacementId: { produitId, emplacementId } },
    });
    expect(stock?.quantite).toBe(30);
  });

  it('rejette avec 409 une sortie supérieure au stock disponible, sans modifier le stock', async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 });

    const response = await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 15 });

    expect(response.status).toBe(409);
    const stock = await prisma.stock.findUnique({
      where: { produitId_emplacementId: { produitId, emplacementId } },
    });
    expect(stock?.quantite).toBe(10); // inchangé
  });

  it('rejette avec 409 une sortie sans aucun stock existant', async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte();

    const response = await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 1 });

    expect(response.status).toBe(409);
  });

  it('déclenche une alerte RUPTURE quand le stock atteint zéro', async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte(5);
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 });

    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 });

    const alerte = await prisma.alerte.findFirst({ where: { produitId, statut: 'ACTIVE' } });
    expect(alerte?.type).toBe('RUPTURE');
    expect(alerte?.quantiteAuDeclenchement).toBe(0);
  });

  it('déclenche une alerte STOCK_FAIBLE quand le stock passe sous le seuil sans atteindre zéro', async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte(5);
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 });

    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 7 });

    const alerte = await prisma.alerte.findFirst({ where: { produitId, statut: 'ACTIVE' } });
    expect(alerte?.type).toBe('STOCK_FAIBLE');
    expect(alerte?.quantiteAuDeclenchement).toBe(3);
  });

  it("résout automatiquement l'alerte quand une entrée fait remonter le stock au-dessus du seuil", async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte(5);
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 });
    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 8 }); // stock = 2, sous le seuil de 5

    const avant = await prisma.alerte.findFirst({ where: { produitId, statut: 'ACTIVE' } });
    expect(avant).not.toBeNull();

    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 }); // stock = 12, au-dessus du seuil

    const apres = await prisma.alerte.findFirst({ where: { produitId, statut: 'ACTIVE' } });
    expect(apres).toBeNull();
    const alerteResolue = await prisma.alerte.findFirst({ where: { produitId, statut: 'RESOLUE' } });
    expect(alerteResolue).not.toBeNull();
    expect(alerteResolue?.resolvedAt).not.toBeNull();
  });

  it('rejette avec 409 un mouvement sur un produit archivé', async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte();
    await request(app.getHttpServer())
      .patch(`/produits/${produitId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`);

    const response = await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 });

    expect(response.status).toBe(409);
  });

  it("rejette avec 404 un mouvement sur un produit d'une autre entreprise", async () => {
    const { accessToken: tokenA, emplacementId: emplacementA } = await creerContexte();
    const { produitId: produitB } = await creerContexte();

    const response = await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ produitId: produitB, emplacementId: emplacementA, quantite: 10 });

    expect(response.status).toBe(404);
  });

  it('rejette avec 400 une quantité négative ou nulle', async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte();

    const response = await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 0 });

    expect(response.status).toBe(400);
  });

  it("l'historique inclut les noms du produit, de l'emplacement et de l'utilisateur, sans donnée sensible", async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 });

    const response = await request(app.getHttpServer())
      .get('/mouvements')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body[0].produit.nom).toBe('Produit Test');
    expect(response.body[0].emplacement.nom).toBe('Entrepôt Test');
    expect(response.body[0].utilisateur.nom).toBe('Admin Mouvements');
    // L'utilisateur est inclus : son hash ne doit jamais suivre.
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it("l'historique des mouvements est filtrable par produit", async () => {    const { accessToken, produitId, emplacementId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 });
    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 3 });

    const response = await request(app.getHttpServer())
      .get(`/mouvements?produit_id=${produitId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
  });

  it('la vue du stock retourne la quantité par emplacement', async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 42 });

    const response = await request(app.getHttpServer())
      .get(`/stock?produit_id=${produitId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].quantite).toBe(42);
  });
});
