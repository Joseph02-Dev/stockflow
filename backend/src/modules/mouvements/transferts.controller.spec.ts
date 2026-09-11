import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';

describe('Transferts de stock entre emplacements — intégration réelle, base PostgreSQL', () => {
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

  async function creerContexte(seuilAlerte = 0) {
    const email = `test-transfert-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Transferts',
      nomAdmin: 'Admin Transferts',
      email,
      password: 'motdepasse-solide-123',
    });
    await prisma.utilisateur.update({ where: { email }, data: { emailVerifieAt: new Date() } });
    const connexion = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'motdepasse-solide-123' });
    const accessToken = connexion.body.accessToken as string;

    const produit = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Produit Transfert', seuilAlerte });
    const madina = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Dépôt Madina' });
    const coyah = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Atelier Coyah' });

    return {
      accessToken,
      produitId: produit.body.id as string,
      madinaId: madina.body.id as string,
      coyahId: coyah.body.id as string,
    };
  }

  it('transfère du stock : diminue la source, augmente la destination', async () => {
    const { accessToken, produitId, madinaId, coyahId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId: madinaId, quantite: 50 });

    const response = await request(app.getHttpServer())
      .post('/mouvements/transfert')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementSourceId: madinaId, emplacementDestinationId: coyahId, quantite: 12 });

    expect(response.status).toBe(201);
    expect(response.body.type).toBe('TRANSFERT');

    const stockMadina = await prisma.stock.findUnique({
      where: { produitId_emplacementId: { produitId, emplacementId: madinaId } },
    });
    const stockCoyah = await prisma.stock.findUnique({
      where: { produitId_emplacementId: { produitId, emplacementId: coyahId } },
    });
    expect(stockMadina?.quantite).toBe(38);
    expect(stockCoyah?.quantite).toBe(12);
  });

  it('refuse avec 409 un transfert supérieur au stock disponible à la source', async () => {
    const { accessToken, produitId, madinaId, coyahId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId: madinaId, quantite: 10 });

    const response = await request(app.getHttpServer())
      .post('/mouvements/transfert')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementSourceId: madinaId, emplacementDestinationId: coyahId, quantite: 999 });

    expect(response.status).toBe(409);
  });

  it('refuse avec 409 un transfert dont la source et la destination sont identiques', async () => {
    const { accessToken, produitId, madinaId } = await creerContexte();

    const response = await request(app.getHttpServer())
      .post('/mouvements/transfert')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementSourceId: madinaId, emplacementDestinationId: madinaId, quantite: 5 });

    expect(response.status).toBe(409);
  });

  it("un transfert n'a aucun impact sur les alertes (stock total inchangé)", async () => {
    const { accessToken, produitId, madinaId, coyahId } = await creerContexte(20);
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId: madinaId, quantite: 50 });

    // Le stock total (50) reste très au-dessus du seuil (20) avant et
    // après le transfert — aucune alerte ne doit exister dans les deux cas.
    await request(app.getHttpServer())
      .post('/mouvements/transfert')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementSourceId: madinaId, emplacementDestinationId: coyahId, quantite: 30 });

    const alertes = await request(app.getHttpServer())
      .get('/alertes?statut=ACTIVE')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(alertes.body).toHaveLength(0);
  });

  it("l'historique filtré par emplacement inclut le transfert pour la source ET la destination", async () => {
    const { accessToken, produitId, madinaId, coyahId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId: madinaId, quantite: 50 });
    await request(app.getHttpServer())
      .post('/mouvements/transfert')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementSourceId: madinaId, emplacementDestinationId: coyahId, quantite: 12 });

    const historiqueCoyah = await request(app.getHttpServer())
      .get(`/mouvements?emplacement_id=${coyahId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const transfert = historiqueCoyah.body.find((m: { type: string }) => m.type === 'TRANSFERT');
    expect(transfert).toBeDefined();
    expect(transfert.emplacement.nom).toBe('Dépôt Madina');
    expect(transfert.emplacementDestination.nom).toBe('Atelier Coyah');
  });

  it('rejette avec 404 un transfert vers un emplacement inexistant', async () => {
    const { accessToken, produitId, madinaId } = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId: madinaId, quantite: 10 });

    const response = await request(app.getHttpServer())
      .post('/mouvements/transfert')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        produitId,
        emplacementSourceId: madinaId,
        emplacementDestinationId: '00000000-0000-4000-8000-000000000000',
        quantite: 5,
      });

    expect(response.status).toBe(404);
  });

  it("rejette avec 404 un transfert vers un emplacement d'une autre entreprise", async () => {
    const contexteA = await creerContexte();
    const contexteB = await creerContexte();
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${contexteA.accessToken}`)
      .send({ produitId: contexteA.produitId, emplacementId: contexteA.madinaId, quantite: 10 });

    const response = await request(app.getHttpServer())
      .post('/mouvements/transfert')
      .set('Authorization', `Bearer ${contexteA.accessToken}`)
      .send({
        produitId: contexteA.produitId,
        emplacementSourceId: contexteA.madinaId,
        emplacementDestinationId: contexteB.madinaId,
        quantite: 5,
      });

    expect(response.status).toBe(404);
  });
});
