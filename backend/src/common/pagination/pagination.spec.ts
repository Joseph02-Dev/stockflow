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
} from '../../modules/console/console-test.utils.js';

describe('Pagination des historiques et tableau de bord calculé par la base', () => {
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

  async function boutique() {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(
      prisma,
      'Boutique Pagination',
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
    const depot = (await http.post('/emplacements', { nom: 'Dépôt A' })).body;
    return { entreprise, http, depot };
  }

  it('pagine les mouvements par curseur, du plus récent au plus ancien, sans doublon ni trou', async () => {
    const b = await boutique();
    const produit = (
      await b.http.post('/produits', {
        nom: 'Article',
        description: 'longue description',
      })
    ).body;
    for (let i = 1; i <= 7; i++) {
      await b.http.post('/mouvements/entree', {
        produitId: produit.id,
        emplacementId: b.depot.id,
        quantite: i,
      });
    }

    const page1 = (await b.http.get('/mouvements?limite=3')).body;
    const page2 = (
      await b.http.get(`/mouvements?limite=3&apres=${page1[2].id}`)
    ).body;
    const page3 = (
      await b.http.get(`/mouvements?limite=3&apres=${page2[2].id}`)
    ).body;

    expect([page1.length, page2.length, page3.length]).toEqual([3, 3, 1]);
    expect(
      [...page1, ...page2, ...page3].map(
        (m: { quantite: number }) => m.quantite,
      ),
    ).toEqual([7, 6, 5, 4, 3, 2, 1]);
    // Sans paramètre : une page de 50 au plus, jamais tout l'historique.
    expect((await b.http.get('/mouvements')).body).toHaveLength(7);
  });

  it('exporte tout l’historique filtré en CSV, en une requête et sans fuite entre entreprises', async () => {
    const a = await boutique();
    const autre = await boutique();
    const produit = (
      await a.http.post('/produits', { nom: 'Ciment, sac "50 kg"' })
    ).body;
    for (let i = 1; i <= 3; i++) {
      await a.http.post('/mouvements/entree', {
        produitId: produit.id,
        emplacementId: a.depot.id,
        quantite: i,
      });
    }

    const reponse = await a.http.get('/mouvements/export');
    const lignes = reponse.text.replace(/^﻿/, '').trim().split('\r\n');

    expect(reponse.status).toBe(200);
    expect(reponse.headers['content-type']).toContain('text/csv');
    expect(reponse.text.startsWith('﻿')).toBe(true);
    expect(lignes[0]).toBe(
      'Date,Type,Produit,Emplacement,Emplacement destination,Quantité,Utilisateur,Fournisseur',
    );
    expect(lignes).toHaveLength(4);
    expect(lignes[1]).toContain('Entrée,"Ciment, sac ""50 kg""",Dépôt A,,3');
    expect(
      (await autre.http.get('/mouvements/export')).text.trim().split('\r\n'),
    ).toHaveLength(1);
  });

  it('refuse une limite ou un curseur invalides', async () => {
    const b = await boutique();
    expect((await b.http.get('/mouvements?limite=0')).status).toBe(400);
    expect((await b.http.get('/mouvements?limite=201')).status).toBe(400);
    expect((await b.http.get('/mouvements?apres=pas-un-uuid')).status).toBe(
      400,
    );
    expect((await b.http.get('/ventes?limite=1000')).status).toBe(400);
  });

  it('pagine les ventes par curseur', async () => {
    const b = await boutique();
    const produit = (
      await b.http.post('/produits', {
        nom: 'Riz',
        prixVente: 1000,
        tauxTva: 0,
      })
    ).body;
    await b.http.post('/mouvements/entree', {
      produitId: produit.id,
      emplacementId: b.depot.id,
      quantite: 100,
    });
    for (let i = 1; i <= 5; i++) {
      await b.http.post('/ventes', {
        emplacementId: b.depot.id,
        modePaiement: 'ESPECES',
        lignes: [{ produitId: produit.id, quantite: i }],
      });
    }

    const page1 = (await b.http.get('/ventes?limite=2')).body;
    const page2 = (await b.http.get(`/ventes?limite=2&apres=${page1[1].id}`))
      .body;
    const page3 = (await b.http.get(`/ventes?limite=2&apres=${page2[1].id}`))
      .body;

    expect(
      [...page1, ...page2, ...page3].map((v: { total: number }) => v.total),
    ).toEqual([5000, 4000, 3000, 2000, 1000]);
  });

  it('le stock ne transporte que les champs utiles du produit', async () => {
    const b = await boutique();
    const produit = (
      await b.http.post('/produits', {
        nom: 'Ciment',
        description: 'x'.repeat(500),
        prixVente: 95_000,
      })
    ).body;
    await b.http.post('/mouvements/entree', {
      produitId: produit.id,
      emplacementId: b.depot.id,
      quantite: 4,
    });

    const [ligne] = (await b.http.get('/stock')).body;

    expect(ligne).toMatchObject({
      quantite: 4,
      produit: { nom: 'Ciment', prixVente: 95_000 },
      emplacement: { nom: 'Dépôt A' },
    });
    expect(ligne.produit.description).toBeUndefined();
  });

  it('calcule les indicateurs du tableau de bord côté serveur', async () => {
    const b = await boutique();
    const depotB = (await b.http.post('/emplacements', { nom: 'Dépôt B' }))
      .body;
    const ciment = (
      await b.http.post('/produits', {
        nom: 'Ciment',
        prixAchat: 1_000,
        seuilAlerte: 50,
      })
    ).body;
    const sansPrix = (await b.http.post('/produits', { nom: 'Sans prix' }))
      .body;
    await b.http.post('/mouvements/entree', {
      produitId: ciment.id,
      emplacementId: b.depot.id,
      quantite: 30,
    });
    await b.http.post('/mouvements/entree', {
      produitId: ciment.id,
      emplacementId: depotB.id,
      quantite: 10,
    });
    await b.http.post('/mouvements/sortie', {
      produitId: ciment.id,
      emplacementId: depotB.id,
      quantite: 5,
    }); // alerte : 35 < 50
    await b.http.post('/mouvements/entree', {
      produitId: sansPrix.id,
      emplacementId: b.depot.id,
      quantite: 3,
    });
    // Un mouvement d'il y a 10 jours : compte dans la semaine précédente, pas dans la série de 9 jours.
    const ancien = await prisma.mouvement.findFirstOrThrow({
      where: { entrepriseId: b.entreprise.id, produitId: sansPrix.id },
    });
    await prisma.mouvement.update({
      where: { id: ancien.id },
      data: { createdAt: new Date(Date.now() - 10 * 86_400_000) },
    });
    await b.http.post('/fournisseurs', { nom: 'F1', delaiLivraisonJours: 4 });
    await b.http.post('/fournisseurs', { nom: 'F2', delaiLivraisonJours: 7 });

    const r = (await b.http.get('/dashboard/indicateurs')).body;

    expect(r).toMatchObject({
      valeurImmobilisee: 35_000,
      lignesSansPrix: 1,
      mouvementsSemaine: 3,
      mouvementsSemainePrecedente: 1,
      delaiFournisseurMoyen: 5.5,
      nombreDelais: 2,
      commandesEnRoute: 0,
      stockProduitsEnAlerte: [
        { produitId: ciment.id, quantite: 35, emplacementBas: 'Dépôt B' },
      ],
    });
    // Valeur en fin de journée : 0 jusqu'à hier, 35 000 aujourd'hui.
    expect(r.serieValeur).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 35_000]);
  });
});
