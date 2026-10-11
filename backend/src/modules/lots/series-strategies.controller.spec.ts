import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';

describe('Numéros de série et stratégies de sortie — intégration réelle, base PostgreSQL', () => {
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

  async function contexte(modules: Record<string, boolean | string> = { moduleNumerosSerie: true, moduleStrategiesSortie: true }) {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, 'Entreprise Séries');
    entrepriseIds.push(entreprise.id);
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: modules });
    const jeton = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    const avec = (r: request.Test) => r.set('Authorization', `Bearer ${jeton}`);
    const http = {
      get: (url: string) => avec(request(app.getHttpServer()).get(url)),
      post: (url: string, corps: object = {}) => avec(request(app.getHttpServer()).post(url)).send(corps),
      patch: (url: string, corps: object = {}) => avec(request(app.getHttpServer()).patch(url)).send(corps),
    };
    const madina = (await http.post('/emplacements', { nom: 'Madina' })).body.id as string;
    const coyah = (await http.post('/emplacements', { nom: 'Coyah' })).body.id as string;
    return { entreprise, http, madina, coyah };
  }

  const lotsEnStock = (produitId: string) =>
    prisma.lot.findMany({ where: { produitId, quantite: { gt: 0 } }, select: { numero: true, quantite: true, emplacementId: true }, orderBy: { numero: 'asc' } });

  it('séries : une unité par numéro, unicité en stock, sortie et transfert unitaires, traçabilité', async () => {
    const { http, madina, coyah } = await contexte();
    const produitId = (await http.post('/produits', { nom: 'Téléphone X1', prixVente: 900000, suiviParSerie: true })).body.id as string;
    const produit = await prisma.produit.findUniqueOrThrow({ where: { id: produitId } });
    expect(produit).toMatchObject({ suiviParLot: true, suiviParSerie: true });

    const entree = await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 3, numerosSerie: ['SN-001', 'SN-002', 'SN-003'] });
    expect(entree.status).toBe(201);
    expect(await prisma.mouvement.count({ where: { produitId, type: 'ENTREE' } })).toBe(3);
    expect((await lotsEnStock(produitId)).map((l) => `${l.numero}:${l.quantite}`)).toEqual(['SN-001:1', 'SN-002:1', 'SN-003:1']);

    // Déjà en stock (casse différente comprise), nombre incohérent, numéro de lot : refusés.
    expect((await http.post('/mouvements/entree', { produitId, emplacementId: coyah, quantite: 1, numerosSerie: ['sn-002'] })).status).toBe(409);
    expect((await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 2, numerosSerie: ['SN-009'] })).status).toBe(400);
    expect((await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 1, numeroLot: 'L1', datePeremption: '2030-01-01' })).status).toBe(400);

    // Sortie : une unité par mouvement ; transfert d'un numéro désigné.
    const sortie = await http.post('/mouvements/sortie', { produitId, emplacementId: madina, quantite: 1 });
    expect(sortie.status).toBe(201);
    const lotSN3 = await prisma.lot.findFirstOrThrow({ where: { produitId, numero: 'SN-003' } });
    const transfert = await http.post('/mouvements/transfert', {
      produitId,
      emplacementSourceId: madina,
      emplacementDestinationId: coyah,
      quantite: 1,
      lotId: lotSN3.id,
    });
    expect(transfert.status).toBe(201);
    const restants = await lotsEnStock(produitId);
    expect(restants.every((l) => l.quantite === 1)).toBe(true);
    expect(restants.find((l) => l.numero === 'SN-003')?.emplacementId).toBe(coyah);

    // Une unité sortie peut revenir avec son numéro.
    const vendue = (await prisma.mouvement.findFirstOrThrow({ where: { produitId, type: 'SORTIE' }, include: { lot: true } })).lot!.numero;
    expect((await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 1, numerosSerie: [vendue] })).status).toBe(201);

    const historique = await http.get(`/produits/${produitId}/tracabilite?numero=SN-003`);
    expect(historique.status).toBe(200);
    expect(historique.body.map((m: { type: string }) => m.type)).toEqual(['ENTREE', 'TRANSFERT']);
  });

  it('séries : activation refusée sur un produit qui a du stock, et module requis', async () => {
    const { entreprise, http, madina } = await contexte();
    const produitId = (await http.post('/produits', { nom: 'Ordinateur' })).body.id as string;
    await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 2 });
    const refus = await http.patch(`/produits/${produitId}`, { suiviParSerie: true });
    expect(refus.status).toBe(409);
    expect(refus.body.message).toMatch(/sans stock/);

    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { moduleNumerosSerie: false } });
    expect((await http.post('/produits', { nom: 'Tablette', suiviParSerie: true })).status).toBe(403);
  });

  it('séries : un inventaire compte 0 ou 1 par numéro ; la réception de commande exige les numéros', async () => {
    const { http, madina } = await contexte();
    const produitId = (await http.post('/produits', { nom: 'Routeur', suiviParSerie: true })).body.id as string;
    await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 1, numerosSerie: ['R-1'] });
    const inventaire = (await http.post('/inventaires', { emplacementId: madina })).body;
    const ligne = (await prisma.inventaireLigne.findFirstOrThrow({ where: { inventaireId: inventaire.id, produitId } })).id;
    expect((await http.patch(`/inventaires/${inventaire.id}/lignes/${ligne}`, { quantiteComptee: 2 })).status).toBe(400);
    expect((await http.patch(`/inventaires/${inventaire.id}/lignes/${ligne}`, { quantiteComptee: 0 })).status).toBe(200);

    const fournisseurId = (await http.post('/fournisseurs', { nom: 'Grossiste' })).body.id as string;
    const commande = (await http.post('/commandes', { fournisseurId, emplacementId: madina, lignes: [{ produitId, quantiteCommandee: 2 }] })).body;
    await http.post(`/commandes/${commande.id}/envoyer`);
    expect((await http.post(`/commandes/${commande.id}/recevoir`, {})).status).toBe(400);
    expect((await http.post(`/commandes/${commande.id}/recevoir`, { lots: [{ produitId, numerosSerie: ['R-2'] }] })).status).toBe(400);
    const recue = await http.post(`/commandes/${commande.id}/recevoir`, { lots: [{ produitId, numerosSerie: ['R-2', 'R-3'] }] });
    expect(recue.status).toBe(201);
    expect((await lotsEnStock(produitId)).map((l) => l.numero)).toEqual(['R-1', 'R-2', 'R-3']);
  });

  it('stratégies : FEFO sans le module, FIFO ou LIFO selon l’entreprise et l’emplacement', async () => {
    const { entreprise, http, madina } = await contexte({ moduleStrategiesSortie: false });
    const produitId = (await http.post('/produits', { nom: 'Lait', suiviParLot: true })).body.id as string;
    const recevoir = async (numero: string, peremption: string, jours: number) => {
      await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 10, numeroLot: numero, datePeremption: peremption });
      await prisma.lot.updateMany({ where: { produitId, numero }, data: { recuAt: new Date(Date.now() - jours * 86_400_000) } });
    };
    await recevoir('ANCIEN', '2031-01-01', 30); // reçu le premier, périme le dernier
    await recevoir('MILIEU', '2030-01-01', 20); // périme le premier
    await recevoir('RECENT', '2030-06-01', 10);
    const sortir = async () => {
      const r = await http.post('/mouvements/sortie', { produitId, emplacementId: madina, quantite: 1 });
      expect(r.status).toBe(201);
      return (await prisma.lot.findUniqueOrThrow({ where: { id: r.body.lotId } })).numero;
    };

    expect(await sortir()).toBe('MILIEU'); // FEFO par défaut, module coupé

    // Stratégie refusée tant que le module est coupé ; puis FIFO pour l'entreprise.
    expect((await http.patch('/entreprise', { strategieSortie: 'FIFO' })).status).toBe(403);
    expect((await http.patch('/entreprise', { moduleStrategiesSortie: true, strategieSortie: 'FIFO' })).status).toBe(200);
    expect(await sortir()).toBe('ANCIEN');

    // L'emplacement l'emporte sur l'entreprise.
    expect((await http.patch(`/emplacements/${madina}`, { strategieSortie: 'LIFO' })).status).toBe(200);
    expect(await sortir()).toBe('RECENT');
    const lots = await http.get(`/produits/${produitId}/lots?emplacement_id=${madina}`);
    expect(lots.body[0]).toMatchObject({ numero: 'RECENT', sortiraEnPremier: true, strategieSortie: 'LIFO' });

    expect((await prisma.entreprise.findUniqueOrThrow({ where: { id: entreprise.id } })).strategieSortie).toBe('FIFO');
  });
});
