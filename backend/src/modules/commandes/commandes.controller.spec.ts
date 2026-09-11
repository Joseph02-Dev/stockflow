import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';

describe('Commandes fournisseur — intégration réelle, base PostgreSQL', () => {
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
      await prisma.commandeLigne.deleteMany({ where: { commande: { entrepriseId: { in: entrepriseIds } } } });
      await prisma.commandeFournisseur.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.alerte.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.mouvement.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.stock.deleteMany({ where: { produit: { entrepriseId: { in: entrepriseIds } } } });
      await prisma.fournisseurProduit.deleteMany({ where: { fournisseur: { entrepriseId: { in: entrepriseIds } } } });
      await prisma.refreshToken.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
      await prisma.verificationEmail.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
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

  async function creerContexte() {
    const email = `test-commande-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Commandes',
      nomAdmin: 'Admin Commandes',
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
    const fournisseur = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Sotragui SA' });
    const produitA = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Fer à béton 12mm', seuilAlerte: 30 });
    const produitB = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Ciment Portland 50kg', seuilAlerte: 20 });

    return {
      accessToken,
      emplacementId: emplacement.body.id as string,
      fournisseurId: fournisseur.body.id as string,
      produitAId: produitA.body.id as string,
      produitBId: produitB.body.id as string,
    };
  }

  it('crée une commande en brouillon avec ses lignes', async () => {
    const { accessToken, emplacementId, fournisseurId, produitAId, produitBId } = await creerContexte();

    const response = await request(app.getHttpServer())
      .post('/commandes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fournisseurId,
        emplacementId,
        lignes: [
          { produitId: produitAId, quantiteCommandee: 50 },
          { produitId: produitBId, quantiteCommandee: 30 },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.statut).toBe('BROUILLON');

    const detail = await request(app.getHttpServer())
      .get(`/commandes/${response.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.body.lignes).toHaveLength(2);
    expect(detail.body.fournisseur.nom).toBe('Sotragui SA');
    expect(detail.body.emplacement.nom).toBe('Dépôt Madina');
  });

  it('rejette avec 400 une commande sans aucune ligne', async () => {
    const { accessToken, emplacementId, fournisseurId } = await creerContexte();

    const response = await request(app.getHttpServer())
      .post('/commandes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fournisseurId, emplacementId, lignes: [] });

    expect(response.status).toBe(400);
  });

  it('modifie les lignes d’une commande en brouillon', async () => {
    const { accessToken, emplacementId, fournisseurId, produitAId, produitBId } = await creerContexte();
    const commande = await request(app.getHttpServer())
      .post('/commandes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fournisseurId, emplacementId, lignes: [{ produitId: produitAId, quantiteCommandee: 50 }] });

    const modification = await request(app.getHttpServer())
      .patch(`/commandes/${commande.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ lignes: [{ produitId: produitBId, quantiteCommandee: 15 }] });

    expect(modification.status).toBe(200);
    const detail = await request(app.getHttpServer())
      .get(`/commandes/${commande.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(detail.body.lignes).toHaveLength(1);
    expect(detail.body.lignes[0].produitId).toBe(produitBId);
  });

  it('refuse de modifier une commande déjà envoyée', async () => {
    const { accessToken, emplacementId, fournisseurId, produitAId } = await creerContexte();
    const commande = await request(app.getHttpServer())
      .post('/commandes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fournisseurId, emplacementId, lignes: [{ produitId: produitAId, quantiteCommandee: 50 }] });
    await request(app.getHttpServer())
      .post(`/commandes/${commande.body.id}/envoyer`)
      .set('Authorization', `Bearer ${accessToken}`);

    const modification = await request(app.getHttpServer())
      .patch(`/commandes/${commande.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ lignes: [{ produitId: produitAId, quantiteCommandee: 99 }] });

    expect(modification.status).toBe(409);
  });

  it('la réception crée les entrées de stock correspondantes et met à jour le statut', async () => {
    const { accessToken, emplacementId, fournisseurId, produitAId, produitBId } = await creerContexte();
    const commande = await request(app.getHttpServer())
      .post('/commandes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fournisseurId,
        emplacementId,
        lignes: [
          { produitId: produitAId, quantiteCommandee: 50 },
          { produitId: produitBId, quantiteCommandee: 30 },
        ],
      });
    await request(app.getHttpServer())
      .post(`/commandes/${commande.body.id}/envoyer`)
      .set('Authorization', `Bearer ${accessToken}`);

    const reception = await request(app.getHttpServer())
      .post(`/commandes/${commande.body.id}/recevoir`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(reception.status).toBe(201);
    expect(reception.body.statut).toBe('RECUE');

    const stockA = await prisma.stock.findUnique({
      where: { produitId_emplacementId: { produitId: produitAId, emplacementId } },
    });
    const stockB = await prisma.stock.findUnique({
      where: { produitId_emplacementId: { produitId: produitBId, emplacementId } },
    });
    expect(stockA?.quantite).toBe(50);
    expect(stockB?.quantite).toBe(30);

    const mouvements = await prisma.mouvement.findMany({
      where: { produitId: { in: [produitAId, produitBId] }, type: 'ENTREE', fournisseurId },
    });
    expect(mouvements).toHaveLength(2);
  });

  it('refuse de recevoir une commande encore en brouillon', async () => {
    const { accessToken, emplacementId, fournisseurId, produitAId } = await creerContexte();
    const commande = await request(app.getHttpServer())
      .post('/commandes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fournisseurId, emplacementId, lignes: [{ produitId: produitAId, quantiteCommandee: 50 }] });

    const reception = await request(app.getHttpServer())
      .post(`/commandes/${commande.body.id}/recevoir`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(reception.status).toBe(409);
  });

  it('refuse d’annuler une commande déjà reçue', async () => {
    const { accessToken, emplacementId, fournisseurId, produitAId } = await creerContexte();
    const commande = await request(app.getHttpServer())
      .post('/commandes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fournisseurId, emplacementId, lignes: [{ produitId: produitAId, quantiteCommandee: 50 }] });
    await request(app.getHttpServer())
      .post(`/commandes/${commande.body.id}/envoyer`)
      .set('Authorization', `Bearer ${accessToken}`);
    await request(app.getHttpServer())
      .post(`/commandes/${commande.body.id}/recevoir`)
      .set('Authorization', `Bearer ${accessToken}`);

    const annulation = await request(app.getHttpServer())
      .post(`/commandes/${commande.body.id}/annuler`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(annulation.status).toBe(409);
  });

  it('annule une commande en brouillon sans toucher au stock', async () => {
    const { accessToken, emplacementId, fournisseurId, produitAId } = await creerContexte();
    const commande = await request(app.getHttpServer())
      .post('/commandes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fournisseurId, emplacementId, lignes: [{ produitId: produitAId, quantiteCommandee: 50 }] });

    const annulation = await request(app.getHttpServer())
      .post(`/commandes/${commande.body.id}/annuler`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(annulation.status).toBe(201);
    expect(annulation.body.statut).toBe('ANNULEE');

    const stock = await prisma.stock.findUnique({
      where: { produitId_emplacementId: { produitId: produitAId, emplacementId } },
    });
    expect(stock).toBeNull();
  });

  it('rejette avec 409 la commande d’un produit archivé', async () => {
    const { accessToken, emplacementId, fournisseurId, produitAId } = await creerContexte();
    await request(app.getHttpServer())
      .patch(`/produits/${produitAId}/archive`)
      .set('Authorization', `Bearer ${accessToken}`);

    const response = await request(app.getHttpServer())
      .post('/commandes')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fournisseurId, emplacementId, lignes: [{ produitId: produitAId, quantiteCommandee: 10 }] });

    expect(response.status).toBe(409);
  });

  it("isolation multi-tenant : une commande d'une autre entreprise est introuvable", async () => {
    const contexteA = await creerContexte();
    const contexteB = await creerContexte();
    const commandeB = await request(app.getHttpServer())
      .post('/commandes')
      .set('Authorization', `Bearer ${contexteB.accessToken}`)
      .send({
        fournisseurId: contexteB.fournisseurId,
        emplacementId: contexteB.emplacementId,
        lignes: [{ produitId: contexteB.produitAId, quantiteCommandee: 10 }],
      });

    const tentative = await request(app.getHttpServer())
      .get(`/commandes/${commandeB.body.id}`)
      .set('Authorization', `Bearer ${contexteA.accessToken}`);

    expect(tentative.status).toBe(404);
  });
});
