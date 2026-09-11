import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';

describe('Inventaires — intégration réelle, base PostgreSQL', () => {
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
      await prisma.inventaireLigne.deleteMany({ where: { inventaire: { entrepriseId: { in: entrepriseIds } } } });
      await prisma.inventaire.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.alerte.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.mouvement.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.stock.deleteMany({ where: { produit: { entrepriseId: { in: entrepriseIds } } } });
      await prisma.refreshToken.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
      await prisma.verificationEmail.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
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
    const email = `test-inventaire-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Inventaire',
      nomAdmin: 'Admin Inventaire',
      email,
      password: 'motdepasse-solide-123',
    });
    await prisma.utilisateur.update({ where: { email }, data: { emailVerifieAt: new Date() } });
    const connexion = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'motdepasse-solide-123' });
    const accessToken = connexion.body.accessToken as string;

    const emplacement = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Dépôt Madina' });
    const produitA = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit A', seuilAlerte: 10 });
    const produitB = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit B', seuilAlerte: 10 });

    return {
      accessToken,
      emplacementId: emplacement.body.id as string,
      produitAId: produitA.body.id as string,
      produitBId: produitB.body.id as string,
    };
  }

  it("GET /inventaires/:id inclut le nom de l'emplacement", async () => {
    const { accessToken, emplacementId } = await creerContexte();
    const inventaire = await request(app.getHttpServer())
      .post('/inventaires')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ emplacementId });

    const detail = await request(app.getHttpServer())
      .get(`/inventaires/${inventaire.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(detail.body.emplacement).toBeDefined();
    expect(detail.body.emplacement.nom).toBe('Dépôt Madina');
  });

  it('crée un inventaire avec une ligne par produit actif du catalogue', async () => {
    const { accessToken, emplacementId } = await creerContexte();

    const response = await request(app.getHttpServer())
      .post('/inventaires')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ emplacementId });

    expect(response.status).toBe(201);
    expect(response.body.statut).toBe('EN_COURS');

    const detail = await request(app.getHttpServer())
      .get(`/inventaires/${response.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.body.lignes).toHaveLength(2);
    // Aucun stock enregistré nulle part : le système doit valoir 0, pas planter.
    expect(detail.body.lignes[0].quantiteSysteme).toBe(0);
    expect(detail.body.lignes[0].quantiteComptee).toBeNull();
  });

  it('un produit archivé ne figure pas dans les lignes générées', async () => {
    const { accessToken, emplacementId, produitAId } = await creerContexte();
    await request(app.getHttpServer())
      .patch(`/produits/${produitAId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`);

    const inventaire = await request(app.getHttpServer())
      .post('/inventaires')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ emplacementId });
    const detail = await request(app.getHttpServer())
      .get(`/inventaires/${inventaire.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(detail.body.lignes).toHaveLength(1);
  });

  it('saisit un comptage et calcule le bon écart face au stock réel', async () => {
    const { accessToken, emplacementId, produitAId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produitAId, emplacementId, quantite: 50 });

    const inventaire = await request(app.getHttpServer())
      .post('/inventaires')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ emplacementId });
    const detailAvant = await request(app.getHttpServer())
      .get(`/inventaires/${inventaire.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const ligneA = detailAvant.body.lignes.find((l: { produitId: string }) => l.produitId === produitAId);

    await request(app.getHttpServer())
      .patch(`/inventaires/${inventaire.body.id}/lignes/${ligneA.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ quantiteComptee: 44 });

    const detailApres = await request(app.getHttpServer())
      .get(`/inventaires/${inventaire.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const ligneMaj = detailApres.body.lignes.find((l: { produitId: string }) => l.produitId === produitAId);

    expect(ligneMaj.quantiteComptee).toBe(44);
    expect(ligneMaj.quantiteSysteme).toBe(50);
    expect(ligneMaj.ecart).toBe(-6);
  });

  it('refuse de modifier un comptage après finalisation', async () => {
    const { accessToken, emplacementId } = await creerContexte();
    const inventaire = await request(app.getHttpServer())
      .post('/inventaires')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ emplacementId });
    await request(app.getHttpServer())
      .post(`/inventaires/${inventaire.body.id}/terminer`)
      .set('Authorization', `Bearer ${accessToken}`);

    const detail = await request(app.getHttpServer())
      .get(`/inventaires/${inventaire.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const ligne = detail.body.lignes[0];

    const response = await request(app.getHttpServer())
      .patch(`/inventaires/${inventaire.body.id}/lignes/${ligne.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ quantiteComptee: 10 });

    expect(response.status).toBe(409);
  });

  it('refuse de valider un écart avant que l’inventaire soit terminé', async () => {
    const { accessToken, emplacementId, produitAId } = await creerContexte();
    const inventaire = await request(app.getHttpServer())
      .post('/inventaires')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ emplacementId });
    const detail = await request(app.getHttpServer())
      .get(`/inventaires/${inventaire.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const ligne = detail.body.lignes.find((l: { produitId: string }) => l.produitId === produitAId);
    await request(app.getHttpServer())
      .patch(`/inventaires/${inventaire.body.id}/lignes/${ligne.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ quantiteComptee: 5 });

    const response = await request(app.getHttpServer())
      .post(`/inventaires/${inventaire.body.id}/lignes/${ligne.id}/valider`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(409);
  });

  it('valide un écart positif : crée un ajustement et augmente le stock', async () => {
    const { accessToken, emplacementId, produitAId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produitAId, emplacementId, quantite: 20 });

    const inventaire = await request(app.getHttpServer())
      .post('/inventaires')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ emplacementId });
    let detail = await request(app.getHttpServer())
      .get(`/inventaires/${inventaire.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const ligne = detail.body.lignes.find((l: { produitId: string }) => l.produitId === produitAId);

    await request(app.getHttpServer())
      .patch(`/inventaires/${inventaire.body.id}/lignes/${ligne.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ quantiteComptee: 25 }); // 5 de plus que le système
    await request(app.getHttpServer())
      .post(`/inventaires/${inventaire.body.id}/terminer`)
      .set('Authorization', `Bearer ${accessToken}`);

    const validation = await request(app.getHttpServer())
      .post(`/inventaires/${inventaire.body.id}/lignes/${ligne.id}/valider`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(validation.status).toBe(201);
    expect(validation.body.ecartApplique).toBe(5);

    const stock = await prisma.stock.findUnique({
      where: { produitId_emplacementId: { produitId: produitAId, emplacementId } },
    });
    expect(stock?.quantite).toBe(25);

    const mouvement = await prisma.mouvement.findFirst({ where: { produitId: produitAId, type: 'AJUSTEMENT' } });
    expect(mouvement?.quantite).toBe(5);

    detail = await request(app.getHttpServer())
      .get(`/inventaires/${inventaire.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const ligneMaj = detail.body.lignes.find((l: { produitId: string }) => l.produitId === produitAId);
    expect(ligneMaj.statutAjustement).toBe('VALIDEE');
  });

  it('valide un écart négatif : diminue le stock et peut déclencher une alerte', async () => {
    const { accessToken, emplacementId, produitAId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produitAId, emplacementId, quantite: 50 });

    const inventaire = await request(app.getHttpServer())
      .post('/inventaires')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ emplacementId });
    const detail = await request(app.getHttpServer())
      .get(`/inventaires/${inventaire.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const ligne = detail.body.lignes.find((l: { produitId: string }) => l.produitId === produitAId);

    // Seuil à 10 ; comptage à 3 : doit déclencher une alerte STOCK_FAIBLE.
    await request(app.getHttpServer())
      .patch(`/inventaires/${inventaire.body.id}/lignes/${ligne.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ quantiteComptee: 3 });
    await request(app.getHttpServer())
      .post(`/inventaires/${inventaire.body.id}/terminer`)
      .set('Authorization', `Bearer ${accessToken}`);

    const validation = await request(app.getHttpServer())
      .post(`/inventaires/${inventaire.body.id}/lignes/${ligne.id}/valider`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(validation.status).toBe(201);
    expect(validation.body.ecartApplique).toBe(-47);

    const alertes = await request(app.getHttpServer())
      .get('/alertes?statut=ACTIVE')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(alertes.body).toHaveLength(1);
    expect(alertes.body[0].type).toBe('STOCK_FAIBLE');
  });

  it('ignorer un écart ne modifie ni le stock ni les mouvements', async () => {
    const { accessToken, emplacementId, produitAId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produitAId, emplacementId, quantite: 20 });

    const inventaire = await request(app.getHttpServer())
      .post('/inventaires')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ emplacementId });
    const detail = await request(app.getHttpServer())
      .get(`/inventaires/${inventaire.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const ligne = detail.body.lignes.find((l: { produitId: string }) => l.produitId === produitAId);

    await request(app.getHttpServer())
      .patch(`/inventaires/${inventaire.body.id}/lignes/${ligne.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ quantiteComptee: 18 });
    await request(app.getHttpServer())
      .post(`/inventaires/${inventaire.body.id}/terminer`)
      .set('Authorization', `Bearer ${accessToken}`);

    const ignorance = await request(app.getHttpServer())
      .post(`/inventaires/${inventaire.body.id}/lignes/${ligne.id}/ignorer`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(ignorance.status).toBe(201);

    const stock = await prisma.stock.findUnique({
      where: { produitId_emplacementId: { produitId: produitAId, emplacementId } },
    });
    expect(stock?.quantite).toBe(20);

    const mouvements = await prisma.mouvement.count({ where: { produitId: produitAId, type: 'AJUSTEMENT' } });
    expect(mouvements).toBe(0);
  });

  it('refuse de valider une seconde fois une ligne déjà traitée', async () => {
    const { accessToken, emplacementId, produitAId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId: produitAId, emplacementId, quantite: 20 });

    const inventaire = await request(app.getHttpServer())
      .post('/inventaires')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ emplacementId });
    const detail = await request(app.getHttpServer())
      .get(`/inventaires/${inventaire.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    const ligne = detail.body.lignes.find((l: { produitId: string }) => l.produitId === produitAId);

    await request(app.getHttpServer())
      .patch(`/inventaires/${inventaire.body.id}/lignes/${ligne.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ quantiteComptee: 15 });
    await request(app.getHttpServer())
      .post(`/inventaires/${inventaire.body.id}/terminer`)
      .set('Authorization', `Bearer ${accessToken}`);
    await request(app.getHttpServer())
      .post(`/inventaires/${inventaire.body.id}/lignes/${ligne.id}/valider`)
      .set('Authorization', `Bearer ${accessToken}`);

    const secondeTentative = await request(app.getHttpServer())
      .post(`/inventaires/${inventaire.body.id}/lignes/${ligne.id}/valider`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(secondeTentative.status).toBe(409);
  });

  it("isolation multi-tenant : un inventaire d'une autre entreprise est introuvable", async () => {
    const contexteA = await creerContexte();
    const contexteB = await creerContexte();
    const inventaireB = await request(app.getHttpServer())
      .post('/inventaires')
      .set('Authorization', `Bearer ${contexteB.accessToken}`)
      .send({ emplacementId: contexteB.emplacementId });

    const tentative = await request(app.getHttpServer())
      .get(`/inventaires/${inventaireB.body.id}`)
      .set('Authorization', `Bearer ${contexteA.accessToken}`);

    expect(tentative.status).toBe(404);
  });
});
