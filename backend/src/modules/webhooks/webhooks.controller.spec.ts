import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';
import { signalerEmission } from './emission.js';
import { LivreurWebhooks } from './livreur-webhooks.js';

interface Recu {
  entetes: IncomingMessage['headers'];
  corps: string;
}

describe('Webhooks — intégration réelle, base PostgreSQL et serveur HTTP local', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let livreur: LivreurWebhooks;
  let serveur: Server;
  let urlServeur: string;
  let statutReponse = 200;
  const recus: Recu[] = [];
  const entrepriseIds: string[] = [];
  const reseauAvant = process.env.WEBHOOKS_RESEAU_PRIVE;

  beforeAll(async () => {
    // Le destinataire de test écoute sur 127.0.0.1 : réseau local autorisé (hors production).
    process.env.WEBHOOKS_RESEAU_PRIVE = 'true';
    serveur = createServer((req, res) => {
      let corps = '';
      req.on('data', (morceau) => (corps += morceau));
      req.on('end', () => {
        recus.push({ entetes: req.headers, corps });
        res.writeHead(statutReponse).end();
      });
    });
    await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
    urlServeur = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/hook`;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    livreur = moduleRef.get(LivreurWebhooks);
  });

  afterEach(async () => {
    await nettoyer(prisma, entrepriseIds.splice(0), []);
    recus.length = 0;
    statutReponse = 200;
  });

  afterAll(async () => {
    await app.close();
    serveur.close();
    if (reseauAvant === undefined) delete process.env.WEBHOOKS_RESEAU_PRIVE;
    else process.env.WEBHOOKS_RESEAU_PRIVE = reseauAvant;
  });

  async function contexte() {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, 'Entreprise Webhooks');
    entrepriseIds.push(entreprise.id);
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { moduleWebhooks: true } });
    const jeton = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    const avec = (r: request.Test) => r.set('Authorization', `Bearer ${jeton}`);
    const http = {
      get: (url: string) => avec(request(app.getHttpServer()).get(url)),
      post: (url: string, corps: object = {}) => avec(request(app.getHttpServer()).post(url)).send(corps),
      patch: (url: string, corps: object = {}) => avec(request(app.getHttpServer()).patch(url)).send(corps),
    };
    const madina = (await http.post('/emplacements', { nom: 'Madina' })).body.id as string;
    const produitId = (await http.post('/produits', { nom: 'Riz', seuilAlerte: 5 })).body.id as string;
    return { entreprise, http, madina, produitId };
  }

  it('mouvement et alerte : événements signés livrés au destinataire', async () => {
    const { http, madina, produitId } = await contexte();
    const abonnement = await http.post('/webhooks', { url: urlServeur, evenements: ['mouvement.cree', 'alerte.stock'] });
    expect(abonnement.status).toBe(201);
    const secret = abonnement.body.secret as string;
    expect(secret).toMatch(/^whsec_/);
    expect((await http.get('/webhooks')).body[0].secret).toBeUndefined();

    await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 8 });
    await http.post('/mouvements/sortie', { produitId, emplacementId: madina, quantite: 6 });
    expect(await livreur.livrer()).toBe(3);

    const types = recus.map((r) => JSON.parse(r.corps).type).sort();
    expect(types).toEqual(['alerte.stock', 'mouvement.cree', 'mouvement.cree']);
    for (const recu of recus) {
      const [t, v1] = String(recu.entetes['x-stockflow-signature']).split(',').map((p) => p.split('=')[1]);
      expect(v1).toBe(createHmac('sha256', secret).update(`${t}.${recu.corps}`).digest('hex'));
    }
    const sortie = recus.map((r) => JSON.parse(r.corps)).find((e) => e.donnees.type === 'SORTIE');
    expect(sortie.donnees).toMatchObject({ produitId, quantite: 6, origine: 'INTERNE', destination: 'CLIENT' });

    const livraisons = await http.get(`/webhooks/${abonnement.body.id}/livraisons`);
    expect(livraisons.body.every((l: { statut: string }) => l.statut === 'LIVREE')).toBe(true);
    expect(await livreur.livrer()).toBe(0);
  });

  it('échec : nouvelle tentative plus tard ; aucun événement sans abonné ni pour un mouvement refusé', async () => {
    const { http, madina, produitId } = await contexte();
    await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 1 });
    expect(await prisma.evenementWebhook.count({ where: { entrepriseId: entrepriseIds[0] } })).toBe(0);

    const abonnement = (await http.post('/webhooks', { url: urlServeur, evenements: ['mouvement.cree'] })).body;
    expect((await http.post('/mouvements/sortie', { produitId, emplacementId: madina, quantite: 50 })).status).toBe(409);
    expect(await prisma.evenementWebhook.count({ where: { entrepriseId: entrepriseIds[0] } })).toBe(0);

    statutReponse = 500;
    await http.post(`/webhooks/${abonnement.id}/test`);
    expect(await livreur.livrer()).toBe(1);
    const [livraison] = (await http.get(`/webhooks/${abonnement.id}/livraisons`)).body;
    expect(livraison).toMatchObject({ statut: 'EN_ATTENTE', tentatives: 1, codeHttp: 500 });
    expect(new Date(livraison.prochaineTentativeAt).getTime()).toBeGreaterThan(Date.now());
    expect(await livreur.livrer()).toBe(0);
  });

  it("livreur au repos : la base n'est interrogée qu'après une émission ou à l'échéance d'une tentative", async () => {
    const { http } = await contexte();
    const abonnement = (await http.post('/webhooks', { url: urlServeur, evenements: ['mouvement.cree'] })).body;
    signalerEmission(0);
    expect(await livreur.passageSiUtile(Date.now())).toBe(true); // démarrage : échéance inconnue
    expect(await livreur.passageSiUtile(Date.now())).toBe(false); // rien en attente, aucune émission

    statutReponse = 500;
    await http.post(`/webhooks/${abonnement.id}/test`);
    expect(await livreur.passageSiUtile(Date.now())).toBe(true); // émission récente : envoi, échec
    expect(recus).toHaveLength(1);

    signalerEmission(0);
    const { prochaineTentativeAt } = await prisma.livraisonWebhook.findFirstOrThrow({
      where: { abonnementId: abonnement.id },
    });
    expect(await livreur.passageSiUtile(prochaineTentativeAt.getTime() - 1_000)).toBe(false);
    expect(await livreur.passageSiUtile(prochaineTentativeAt.getTime())).toBe(true);
  });

  it('péremption quotidienne, URL refusée en production, routes réservées au module', async () => {
    const { entreprise, http, madina } = await contexte();
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { moduleLots: true } });
    const lait = (await http.post('/produits', { nom: 'Lait', suiviParLot: true })).body.id as string;
    await http.post('/mouvements/entree', { produitId: lait, emplacementId: madina, quantite: 3, numeroLot: 'L1', datePeremption: '2020-01-01' });
    await http.post('/webhooks', { url: urlServeur, evenements: ['lot.peremption'] });
    await livreur.peremptionsQuotidiennes();
    await livreur.livrer();
    expect(recus).toHaveLength(1);
    expect(JSON.parse(recus[0].corps).donnees.lots[0]).toMatchObject({ numero: 'L1', quantite: 3, perime: true });

    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect((await http.post('/webhooks', { url: 'https://127.0.0.1/hook', evenements: ['mouvement.cree'] })).status).toBe(400);
    } finally {
      process.env.NODE_ENV = nodeEnv;
    }
    expect((await http.post('/webhooks', { url: urlServeur, evenements: ['inconnu'] })).status).toBe(400);
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { moduleWebhooks: false } });
    expect((await http.get('/webhooks')).body.code).toBe('MODULE_DESACTIVE');
  });
});
