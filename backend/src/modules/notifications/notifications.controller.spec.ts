import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';

describe('Notifications (cloche) — intégration réelle, base PostgreSQL', () => {
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

  async function contexte(nom: string, moduleLots = true) {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, nom);
    entrepriseIds.push(entreprise.id);
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { moduleLots } });
    const jeton = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    const avec = (r: request.Test) => r.set('Authorization', `Bearer ${jeton}`);
    const http = {
      get: (url: string) => avec(request(app.getHttpServer()).get(url)),
      post: (url: string, corps: object = {}) => avec(request(app.getHttpServer()).post(url)).send(corps),
    };
    const depot = (await http.post('/emplacements', { nom: 'Dépôt Madina' })).body.id as string;
    return { http, depot, entrepriseId: entreprise.id };
  }

  const dans = (jours: number) => new Date(Date.now() + jours * 86_400_000).toISOString().slice(0, 10);

  it('réunit alertes de stock et lots à surveiller, le plus grave d’abord', async () => {
    const c = await contexte('Supérette Kaloum');
    const huile = (await c.http.post('/produits', { nom: 'Huile 1 L', seuilAlerte: 10, uniteMesure: 'Bidon' })).body.id as string;
    await c.http.post('/mouvements/entree', { produitId: huile, emplacementId: c.depot, quantite: 12 });
    await c.http.post('/mouvements/sortie', { produitId: huile, emplacementId: c.depot, quantite: 9 });

    const lait = (await c.http.post('/produits', { nom: 'Lait', suiviParLot: true, prixAchat: 2_000 })).body.id as string;
    for (const [numero, jours] of [['L-PROCHE', 5], ['L-SURVEILLE', 20], ['L-LOIN', 90]] as const) {
      await c.http.post('/mouvements/entree', { produitId: lait, emplacementId: c.depot, quantite: 6, numeroLot: numero, datePeremption: dans(jours) });
    }
    // Un lot déjà périmé ne peut pas être reçu : on le date après coup.
    await c.http.post('/mouvements/entree', { produitId: lait, emplacementId: c.depot, quantite: 4, numeroLot: 'L-PERIME', datePeremption: dans(40) });
    await prisma.lot.updateMany({ where: { numero: 'L-PERIME', produitId: lait }, data: { datePeremption: new Date(Date.now() - 3 * 86_400_000) } });

    const reponse = await c.http.get('/notifications');
    expect(reponse.status).toBe(200);
    const resume = reponse.body.notifications.map((n: { type: string; niveau: string; lot?: { numero: string } }) => [n.niveau, n.type, n.lot?.numero ?? null]);
    expect(resume).toEqual([
      ['CRITIQUE', 'LOT_PERIME', 'L-PERIME'],
      ['AVERTISSEMENT', 'STOCK_FAIBLE', null],
      ['AVERTISSEMENT', 'LOT_BIENTOT_PERIME', 'L-PROCHE'],
      ['INFO', 'LOT_A_SURVEILLER', 'L-SURVEILLE'],
    ]);
    expect(reponse.body.nonLues).toBe(4);
    const alerte = reponse.body.notifications[1];
    expect(alerte).toMatchObject({ lue: false, produit: { id: huile, nom: 'Huile 1 L', uniteMesure: 'Bidon' }, stock: { actuel: 3, seuil: 10 } });
    expect(reponse.body.notifications[0].lot).toMatchObject({ quantite: 4, valeur: 8_000, emplacement: 'Dépôt Madina' });
  });

  it('mémorise la lecture par utilisateur ; une aggravation redevient non lue', async () => {
    const c = await contexte('Boutique Dixinn', false);
    const riz = (await c.http.post('/produits', { nom: 'Riz 25 kg', seuilAlerte: 10 })).body.id as string;
    await c.http.post('/mouvements/entree', { produitId: riz, emplacementId: c.depot, quantite: 12 });
    await c.http.post('/mouvements/sortie', { produitId: riz, emplacementId: c.depot, quantite: 5 });

    const avant = (await c.http.get('/notifications')).body;
    expect(avant.nonLues).toBe(1);
    const cle = avant.notifications[0].cle as string;
    expect((await c.http.post('/notifications/lues', { cles: [cle, cle] })).status).toBe(204);
    // Idempotent.
    expect((await c.http.post('/notifications/lues', { cles: [cle] })).status).toBe(204);
    const apres = (await c.http.get('/notifications')).body;
    expect(apres).toMatchObject({ nonLues: 0, notifications: [{ cle, lue: true }] });

    await c.http.post('/mouvements/sortie', { produitId: riz, emplacementId: c.depot, quantite: 7 });
    const rupture = (await c.http.get('/notifications')).body;
    expect(rupture).toMatchObject({ nonLues: 1, notifications: [{ type: 'RUPTURE', niveau: 'CRITIQUE', lue: false }] });
  });

  it('module Lots coupé : aucune péremption ; clés invalides refusées', async () => {
    const c = await contexte('Dépôt Ratoma');
    const lait = (await c.http.post('/produits', { nom: 'Lait', suiviParLot: true })).body.id as string;
    await c.http.post('/mouvements/entree', { produitId: lait, emplacementId: c.depot, quantite: 5, numeroLot: 'L-1', datePeremption: dans(2) });
    expect((await c.http.get('/notifications')).body.nonLues).toBe(1);
    await prisma.entreprise.update({ where: { id: c.entrepriseId }, data: { moduleLots: false } });
    expect((await c.http.get('/notifications')).body).toEqual({ notifications: [], nonLues: 0 });

    for (const cles of [[], ['autre:123'], ['alerte:pas-un-uuid:RUPTURE']]) {
      expect((await c.http.post('/notifications/lues', { cles })).status).toBe(400);
    }
    expect((await request(app.getHttpServer()).get('/notifications')).status).toBe(401);
  });

  it('une entreprise ne voit pas les notifications d’une autre', async () => {
    const a = await contexte('Entreprise A');
    const b = await contexte('Entreprise B');
    const p = (await a.http.post('/produits', { nom: 'Savon', seuilAlerte: 5 })).body.id as string;
    await a.http.post('/mouvements/entree', { produitId: p, emplacementId: a.depot, quantite: 6 });
    await a.http.post('/mouvements/sortie', { produitId: p, emplacementId: a.depot, quantite: 6 });
    expect((await a.http.get('/notifications')).body.nonLues).toBe(1);
    expect((await b.http.get('/notifications')).body).toEqual({ notifications: [], nonLues: 0 });
  });
});
