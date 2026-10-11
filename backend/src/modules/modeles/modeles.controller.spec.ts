import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';

describe('Variantes et conditionnements — intégration réelle, base PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const entrepriseIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterEach(async () => {
    await nettoyer(prisma, entrepriseIds.splice(0), []);
  });

  afterAll(async () => {
    await app.close();
  });

  async function contexte(modules = { moduleVariantes: true, moduleConditionnements: true }) {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, 'Entreprise Variantes');
    entrepriseIds.push(entreprise.id);
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: modules });
    const jeton = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    const avec = (r: request.Test) => r.set('Authorization', `Bearer ${jeton}`);
    const http = {
      get: (url: string) => avec(request(app.getHttpServer()).get(url)),
      post: (url: string, corps: object) => avec(request(app.getHttpServer()).post(url)).send(corps),
      patch: (url: string, corps: object = {}) => avec(request(app.getHttpServer()).patch(url)).send(corps),
    };
    const madina = (await http.post('/emplacements', { nom: 'Madina' })).body.id as string;
    return { entreprise, http, madina };
  }

  const TSHIRT = {
    nom: 'T-shirt',
    reference: 'TS',
    prixVente: 50000,
    attributs: [
      { nom: 'Couleur', valeurs: ['Rouge', 'Bleu'] },
      { nom: 'Taille', valeurs: ['S', 'M'] },
    ],
  };

  it('crée la grille de variantes, chacune produit à part entière', async () => {
    const { http, madina } = await contexte();
    const modele = await http.post('/modeles', TSHIRT);
    expect(modele.status).toBe(201);
    expect(modele.body.variantes.map((v: { nom: string; reference: string }) => `${v.nom} | ${v.reference}`)).toEqual([
      'T-shirt — Bleu / M | TS-BLEU-M',
      'T-shirt — Bleu / S | TS-BLEU-S',
      'T-shirt — Rouge / M | TS-ROUGE-M',
      'T-shirt — Rouge / S | TS-ROUGE-S',
    ]);

    // Une variante se stocke et se vend comme n'importe quel produit.
    const rougeM = modele.body.variantes.find((v: { reference: string }) => v.reference === 'TS-ROUGE-M');
    expect(rougeM.prixVente).toBe(50000);
    expect((await http.post('/mouvements/entree', { produitId: rougeM.id, emplacementId: madina, quantite: 7 })).status).toBe(201);
    const detail = await http.get(`/modeles/${modele.body.id}`);
    expect(detail.body.variantes.find((v: { id: string }) => v.id === rougeM.id).stock).toBe(7);
    const filtre = await http.get(`/produits?modele_id=${modele.body.id}`);
    expect(filtre.body).toHaveLength(4);
  });

  it('ajouter une valeur crée seulement les variantes manquantes ; retirer une valeur est refusé', async () => {
    const { http } = await contexte();
    const { id } = (await http.post('/modeles', TSHIRT)).body;
    const ajout = await http.patch(`/modeles/${id}`, {
      attributs: [
        { nom: 'Couleur', valeurs: ['Rouge', 'Bleu', 'Vert'] },
        { nom: 'Taille', valeurs: ['S', 'M'] },
      ],
    });
    expect(ajout.status).toBe(200);
    expect(ajout.body.variantes).toHaveLength(6);
    expect(await prisma.produit.count({ where: { modeleId: id } })).toBe(6);

    const retrait = await http.patch(`/modeles/${id}`, {
      attributs: [
        { nom: 'Couleur', valeurs: ['Rouge'] },
        { nom: 'Taille', valeurs: ['S', 'M'] },
      ],
    });
    expect(retrait.status).toBe(409);

    const archive = await http.patch(`/modeles/${id}/archive`);
    expect(archive.status).toBe(200);
    expect(await prisma.produit.count({ where: { modeleId: id, archive: false } })).toBe(0);
  });

  it('refuse une grille trop grande, la limite de références et le module coupé', async () => {
    const { entreprise, http } = await contexte();
    const enorme = await http.post('/modeles', {
      nom: 'Énorme',
      attributs: [
        { nom: 'A', valeurs: Array.from({ length: 15 }, (_, i) => `a${i}`) },
        { nom: 'B', valeurs: Array.from({ length: 15 }, (_, i) => `b${i}`) },
      ],
    });
    expect(enorme.status).toBe(400);

    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { limiteReferences: 3 } });
    const limite = await http.post('/modeles', TSHIRT);
    expect(limite.status).toBe(403);
    expect(limite.body.code).toBe('LIMITE_ATTEINTE');
    expect(await prisma.modeleProduit.count({ where: { entrepriseId: entreprise.id } })).toBe(0);

    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { moduleVariantes: false } });
    const coupe = await http.get('/modeles');
    expect(coupe.status).toBe(403);
    expect(coupe.body.code).toBe('MODULE_DESACTIVE');
  });

  it('conditionnements : saisie en cartons convertie en unités, facteur figé sur le mouvement', async () => {
    const { http, madina } = await contexte();
    const produitId = (await http.post('/produits', { nom: 'Eau minérale' })).body.id as string;
    const carton = await http.post(`/produits/${produitId}/conditionnements`, { nom: 'Carton', facteur: 12 });
    expect(carton.status).toBe(201);
    const palette = await http.post(`/produits/${produitId}/conditionnements`, { nom: 'Palette', facteur: 240 });
    expect(palette.status).toBe(201);
    expect((await http.post(`/produits/${produitId}/conditionnements`, { nom: 'Carton', facteur: 6 })).status).toBe(409);
    expect((await http.post(`/produits/${produitId}/conditionnements`, { nom: 'Unité', facteur: 1 })).status).toBe(400);

    const entree = await http.post('/mouvements/entree', {
      produitId,
      emplacementId: madina,
      quantite: 2,
      conditionnementId: palette.body.id,
    });
    expect(entree.status).toBe(201);
    expect(entree.body).toMatchObject({ quantite: 480, conditionnementId: palette.body.id, facteurConditionnement: 240 });

    const sortie = await http.post('/stock/mouvements', {
      produitId,
      source: { nature: 'INTERNE', emplacementId: madina },
      destination: { nature: 'CLIENT' },
      quantite: 3,
      conditionnementId: carton.body.id,
    });
    expect(sortie.status).toBe(201);
    expect(sortie.body.quantite).toBe(36);
    const stock = await prisma.stock.findUnique({ where: { produitId_emplacementId: { produitId, emplacementId: madina } } });
    expect(stock?.quantite).toBe(444);

    const liste = await http.get(`/produits/${produitId}/conditionnements`);
    expect(liste.body.map((c: { nom: string }) => c.nom)).toEqual(['Carton', 'Palette']);

    // Conditionnement d'un autre produit : refusé.
    const autre = (await http.post('/produits', { nom: 'Jus' })).body.id as string;
    const mauvais = await http.post('/mouvements/entree', {
      produitId: autre,
      emplacementId: madina,
      quantite: 1,
      conditionnementId: carton.body.id,
    });
    expect(mauvais.status).toBe(404);

    // Archivé : plus de saisie possible, l'historique reste.
    expect((await http.patch(`/conditionnements/${carton.body.id}/archive`)).status).toBe(200);
    const apresArchive = await http.post('/mouvements/sortie', {
      produitId,
      emplacementId: madina,
      quantite: 1,
      conditionnementId: carton.body.id,
    });
    expect(apresArchive.status).toBe(409);
  });

  it('conditionnements : module coupé, la saisie convertie est refusée', async () => {
    const { http, madina } = await contexte({ moduleVariantes: false, moduleConditionnements: true });
    const produitId = (await http.post('/produits', { nom: 'Ciment' })).body.id as string;
    const sac = (await http.post(`/produits/${produitId}/conditionnements`, { nom: 'Palette', facteur: 40 })).body.id;
    await http.patch('/entreprise', { moduleConditionnements: false });
    const refus = await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 1, conditionnementId: sac });
    expect(refus.status).toBe(403);
    expect(refus.body.code).toBe('MODULE_DESACTIVE');
  });
});
