import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import {
  connecterClient,
  creerEntrepriseAvecAdmin,
  nettoyer,
} from '../console/console-test.utils.js';

const JOUR_MS = 86_400_000;

describe('Créances', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const entrepriseIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await nettoyer(prisma, entrepriseIds, []);
    await app.close();
  });

  /** Boutique avec un produit à 1 000 GNF sans TVA : total = quantité × 1 000. */
  async function boutique(nom = 'Boutique Créances') {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(
      prisma,
      nom,
    );
    entrepriseIds.push(entreprise.id);
    const jeton = (await connecterClient(app, utilisateur.email)).body
      .accessToken as string;
    const http = {
      get: (url: string) =>
        request(app.getHttpServer())
          .get(url)
          .set('Authorization', `Bearer ${jeton}`),
      post: (url: string, corps: object = {}) =>
        request(app.getHttpServer())
          .post(url)
          .set('Authorization', `Bearer ${jeton}`)
          .send(corps),
    };
    const depot = (await http.post('/emplacements', { nom: 'Dépôt' })).body;
    const produit = (
      await http.post('/produits', {
        nom: 'Article',
        prixVente: 1_000,
        tauxTva: 0,
      })
    ).body;
    await http.post('/mouvements/entree', {
      produitId: produit.id,
      emplacementId: depot.id,
      quantite: 100_000,
    });

    const client = async (nomClient: string) =>
      (await http.post('/clients', { nom: nomClient })).body;
    /** Vente à crédit de `montant` GNF, antidatée de `ilYaJours` jours. */
    const venteACredit = async (
      clientId: string,
      montant: number,
      ilYaJours = 0,
      echeanceAt?: Date,
    ) => {
      const vente = (
        await http.post('/ventes', {
          emplacementId: depot.id,
          clientId,
          modePaiement: 'CREDIT',
          lignes: [{ produitId: produit.id, quantite: montant / 1_000 }],
          ...(echeanceAt ? { echeanceAt: echeanceAt.toISOString() } : {}),
        })
      ).body;
      if (ilYaJours > 0) {
        await prisma.vente.update({
          where: { id: vente.id },
          data: { createdAt: new Date(Date.now() - ilYaJours * JOUR_MS) },
        });
      }
      return vente;
    };
    return { http, client, venteACredit };
  }

  it('classe les débiteurs par ancienneté de la dette, pas par montant', async () => {
    const b = await boutique();
    const ancien = await b.client('Petite dette ancienne');
    const recent = await b.client('Grosse dette récente');
    await b.venteACredit(recent.id, 3_150_000, 1);
    await b.venteACredit(ancien.id, 1_473_000, 71);

    const reponse = await b.http.get('/creances');

    expect(reponse.status).toBe(200);
    expect(
      reponse.body.debiteurs.map(
        (d: { client: { nom: string } }) => d.client.nom,
      ),
    ).toEqual(['Petite dette ancienne', 'Grosse dette récente']);
    expect(reponse.body.debiteurs[0]).toMatchObject({
      solde: 1_473_000,
      ancienneteJours: 71,
    });
  });

  it('résume le total dû, le retard et les tranches de vieillissement', async () => {
    const b = await boutique();
    const c1 = await b.client('Client 1');
    const c2 = await b.client('Client 2');
    await b.venteACredit(c1.id, 100_000, 3);
    await b.venteACredit(
      c1.id,
      200_000,
      20,
      new Date(Date.now() - 2 * JOUR_MS),
    ); // échéance dépassée
    await b.venteACredit(c2.id, 300_000, 45); // sans échéance, > 30 jours : en retard
    await b.venteACredit(c2.id, 400_000, 90);
    const soldee = await b.venteACredit(c2.id, 50_000, 10);
    await b.http.post(`/ventes/${soldee.id}/reglements`, {
      montant: 50_000,
      mode: 'ESPECES',
    });

    const { resume } = (await b.http.get('/creances')).body;

    expect(resume).toMatchObject({
      totalDu: 1_000_000,
      nombreClients: 2,
      montantEnRetard: 900_000,
      encaisseCetteSemaine: 50_000,
    });
    expect(resume.tranches.map((t: { montant: number }) => t.montant)).toEqual([
      100_000, 200_000, 300_000, 400_000,
    ]);
  });

  it('une vente annulée ou soldée ne figure plus dans les créances', async () => {
    const b = await boutique();
    const client = await b.client('Client annulé');
    const vente = await b.venteACredit(client.id, 500_000);
    await b.http.post(`/ventes/${vente.id}/annuler`, {
      motif: 'Erreur de saisie',
    });

    expect((await b.http.get('/creances')).body.debiteurs).toEqual([]);
  });

  it('encaisse en soldant les ventes de la plus ancienne à la plus récente', async () => {
    const b = await boutique();
    const client = await b.client('Client FIFO');
    const ancienne = await b.venteACredit(client.id, 300_000, 40);
    const recente = await b.venteACredit(client.id, 500_000, 5);

    const trop = await b.http.post(`/clients/${client.id}/reglements`, {
      montant: 800_001,
      mode: 'ESPECES',
    });
    expect(trop.status).toBe(400);

    const reponse = await b.http.post(`/clients/${client.id}/reglements`, {
      montant: 450_000,
      mode: 'ORANGE_MONEY',
    });

    expect(reponse.status).toBe(201);
    expect(reponse.body.reglements).toEqual([
      { venteId: ancienne.id, numero: ancienne.numero, montant: 300_000 },
      { venteId: recente.id, numero: recente.numero, montant: 150_000 },
    ]);
    expect(reponse.body.solde).toBe(350_000);
    expect((await b.http.get(`/ventes/${ancienne.id}`)).body.resteDu).toBe(0);
  });

  it('isolation multi-tenant : les créances d’une entreprise restent invisibles aux autres', async () => {
    const a = await boutique('Créances A');
    const b = await boutique('Créances B');
    const clientA = await a.client('Débiteur de A');
    await a.venteACredit(clientA.id, 200_000);

    expect((await b.http.get('/creances')).body).toMatchObject({
      debiteurs: [],
      resume: { totalDu: 0, nombreClients: 0 },
    });
    expect(
      (
        await b.http.post(`/clients/${clientA.id}/reglements`, {
          montant: 1_000,
          mode: 'ESPECES',
        })
      ).status,
    ).toBe(404);
  });
});
