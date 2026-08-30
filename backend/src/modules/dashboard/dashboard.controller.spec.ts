import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';

describe('Dashboard (DASH-001, DASH-002) — intégration réelle, base PostgreSQL', () => {
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

  async function creerContexte() {
    const email = `test-dash-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    const registerResponse = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Dashboard',
      nomAdmin: 'Admin Dashboard',
      email,
      password: 'motdepasse-solide-123',
    });
    return { accessToken: registerResponse.body.accessToken as string };
  }

  it('retourne un dashboard vide et cohérent pour une entreprise nouvellement créée', async () => {
    const { accessToken } = await creerContexte();

    const response = await request(app.getHttpServer())
      .get('/dashboard/overview')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.kpi).toEqual({
      produitsActifs: 0,
      emplacementsActifs: 0,
      alertesActives: 0,
      mouvements7Jours: 0,
      quantiteTotaleEnStock: 0,
    });
    expect(response.body.produitsEnAlerte).toHaveLength(0);
  });

  it('compte correctement les produits, emplacements, mouvements et le stock total', async () => {
    const { accessToken } = await creerContexte();
    const produit = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit Dashboard' });
    const emplacement = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Entrepôt Dashboard' });
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produit.body.id, emplacementId: emplacement.body.id, quantite: 40 });
    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produit.body.id, emplacementId: emplacement.body.id, quantite: 15 });

    const response = await request(app.getHttpServer())
      .get('/dashboard/overview')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.body.kpi.produitsActifs).toBe(1);
    expect(response.body.kpi.emplacementsActifs).toBe(1);
    expect(response.body.kpi.mouvements7Jours).toBe(2);
    expect(response.body.kpi.quantiteTotaleEnStock).toBe(25);
  });

  it('exclut des KPI les produits et emplacements archivés', async () => {
    const { accessToken } = await creerContexte();
    const produit = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit à archiver' });
    const emplacement = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Entrepôt à archiver' });
    await request(app.getHttpServer())
      .patch(`/produits/${produit.body.id}/archive`)
      .set('Authorization', `Bearer ${accessToken}`);
    await request(app.getHttpServer())
      .patch(`/emplacements/${emplacement.body.id}/archive`)
      .set('Authorization', `Bearer ${accessToken}`);

    const response = await request(app.getHttpServer())
      .get('/dashboard/overview')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.body.kpi.produitsActifs).toBe(0);
    expect(response.body.kpi.emplacementsActifs).toBe(0);
  });

  it('liste les produits en alerte avec leur type et leur seuil (DASH-002)', async () => {
    const { accessToken } = await creerContexte();
    const produit = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Vis inox', seuilAlerte: 10 });
    const emplacement = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Entrepôt Alerte' });
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produit.body.id, emplacementId: emplacement.body.id, quantite: 20 });
    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produit.body.id, emplacementId: emplacement.body.id, quantite: 15 });

    const response = await request(app.getHttpServer())
      .get('/dashboard/overview')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.body.kpi.alertesActives).toBe(1);
    expect(response.body.produitsEnAlerte).toHaveLength(1);
    expect(response.body.produitsEnAlerte[0]).toMatchObject({
      produitNom: 'Vis inox',
      type: 'STOCK_FAIBLE',
      quantiteAuDeclenchement: 5,
      seuilAlerte: 10,
    });
  });

  it("une alerte résolue disparaît du dashboard", async () => {
    const { accessToken } = await creerContexte();
    const produit = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit Résolu', seuilAlerte: 10 });
    const emplacement = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Entrepôt Résolu' });
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produit.body.id, emplacementId: emplacement.body.id, quantite: 20 });
    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produit.body.id, emplacementId: emplacement.body.id, quantite: 15 });
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produit.body.id, emplacementId: emplacement.body.id, quantite: 30 });

    const response = await request(app.getHttpServer())
      .get('/dashboard/overview')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.body.kpi.alertesActives).toBe(0);
    expect(response.body.produitsEnAlerte).toHaveLength(0);
  });

  it("le dashboard d'une entreprise ne reflète jamais les données d'une autre (isolation multi-tenant)", async () => {
    const contexteA = await creerContexte();
    const contexteB = await creerContexte();
    await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${contexteB.accessToken}`)
      .send({ nom: 'Produit de B' });

    const dashboardA = await request(app.getHttpServer())
      .get('/dashboard/overview')
      .set('Authorization', `Bearer ${contexteA.accessToken}`);

    expect(dashboardA.body.kpi.produitsActifs).toBe(0);
  });

  it('rejette avec 401 une requête sans authentification', async () => {
    const response = await request(app.getHttpServer()).get('/dashboard/overview');
    expect(response.status).toBe(401);
  });
});
