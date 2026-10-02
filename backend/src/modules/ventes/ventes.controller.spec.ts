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

describe('Ventes', () => {
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

  /** Entreprise prête à vendre : un dépôt, trois produits en stock. */
  async function boutique(nom = 'Boutique Ventes') {
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
    const depot = (await http.post('/emplacements', { nom: 'Dépôt Madina' }))
      .body;
    const creerProduit = async (corps: object, stock: number) => {
      const produit = (await http.post('/produits', corps)).body;
      await http.post('/mouvements/entree', {
        produitId: produit.id,
        emplacementId: depot.id,
        quantite: stock,
      });
      return produit;
    };
    const ciment = await creerProduit(
      {
        nom: 'Ciment 50 kg',
        prixVente: 95_000,
        prixDemiGros: 91_000,
        prixGros: 88_000,
        tauxTva: 18,
      },
      100,
    );
    const fer = await creerProduit(
      { nom: 'Fer 12 mm', prixVente: 148_000, tauxTva: 18 },
      50,
    );
    const riz = await creerProduit(
      { nom: 'Riz 25 kg', prixVente: 300_000, tauxTva: 0 },
      20,
    );
    const client = async (categorie: string, plafondCredit?: number) =>
      (
        await http.post('/clients', {
          nom: `Client ${categorie}`,
          categorie,
          telephone: '+224 622 45 18 03',
          plafondCredit,
        })
      ).body;
    const stock = async (produitId: string) =>
      (await prisma.stock.findUnique({
        where: {
          produitId_emplacementId: { produitId, emplacementId: depot.id },
        },
      }))!.quantite;
    const solde = async (clientId: string) =>
      (await http.get(`/clients/${clientId}/situation`)).body.solde as number;
    return { entreprise, http, depot, ciment, fer, riz, client, stock, solde };
  }

  it('une vente crée une sortie de stock par ligne et fige libellés et prix', async () => {
    const b = await boutique();
    const reponse = await b.http.post('/ventes', {
      emplacementId: b.depot.id,
      modePaiement: 'ESPECES',
      lignes: [
        { produitId: b.ciment.id, quantite: 10 },
        { produitId: b.fer.id, quantite: 3 },
      ],
    });

    expect(reponse.status).toBe(201);
    expect(reponse.body.numero).toMatch(/^V-\d{4}-0001$/);
    expect(await b.stock(b.ciment.id)).toBe(90);
    expect(await b.stock(b.fer.id)).toBe(47);
    const sorties = await prisma.mouvement.findMany({
      where: { entrepriseId: b.entreprise.id, type: 'SORTIE' },
    });
    expect(sorties.map((m) => [m.produitId, m.quantite]).sort()).toEqual(
      [
        [b.ciment.id, 10],
        [b.fer.id, 3],
      ].sort(),
    );
    // Vente au comptant : réglée intégralement, rien n'est dû.
    expect(reponse.body).toMatchObject({
      paye: reponse.body.total,
      resteDu: 0,
    });

    // Le produit change de nom et de prix : la vente d'hier ne bouge pas.
    await prisma.produit.update({
      where: { id: b.ciment.id },
      data: { nom: 'Ciment renommé', prixVente: 1 },
    });
    const detail = await b.http.get(`/ventes/${reponse.body.id}`);
    expect(detail.body.lignes[0]).toMatchObject({
      libelle: 'Ciment 50 kg',
      prixUnitaire: 95_000,
    });
  });

  it('stock insuffisant sur une seule ligne : 409 nommant le produit, rien n’est enregistré', async () => {
    const b = await boutique();
    const reponse = await b.http.post('/ventes', {
      emplacementId: b.depot.id,
      modePaiement: 'ESPECES',
      lignes: [
        { produitId: b.ciment.id, quantite: 10 },
        { produitId: b.riz.id, quantite: 21 },
      ],
    });

    expect(reponse.status).toBe(409);
    expect(reponse.body.message).toContain('Riz 25 kg');
    expect(
      await prisma.vente.count({ where: { entrepriseId: b.entreprise.id } }),
    ).toBe(0);
    expect(
      await prisma.mouvement.count({
        where: { entrepriseId: b.entreprise.id, type: 'SORTIE' },
      }),
    ).toBe(0);
    expect(await b.stock(b.ciment.id)).toBe(100);
  });

  it('les totaux sont calculés par le serveur ; des totaux envoyés par le client sont refusés', async () => {
    const b = await boutique();
    const lignes = [
      { produitId: b.ciment.id, quantite: 40 },
      { produitId: b.riz.id, quantite: 2 },
    ];

    const truquee = await b.http.post('/ventes', {
      emplacementId: b.depot.id,
      modePaiement: 'ESPECES',
      lignes,
      total: 1,
      sousTotal: 1,
    });
    expect(truquee.status).toBe(400);

    const reponse = await b.http.post('/ventes', {
      emplacementId: b.depot.id,
      modePaiement: 'ESPECES',
      tauxRemise: 4,
      lignes,
    });
    // 40 × 95 000 + 2 × 300 000 = 4 400 000 ; remise 4 % = 176 000, ventilée
    // 152 000 (18 %) / 24 000 (0 %) ; TVA = 3 648 000 × 18 % = 656 640.
    expect(reponse.body).toMatchObject({
      sousTotal: 4_400_000,
      remise: 176_000,
      montantTva: 656_640,
      total: 4_880_640,
    });
    expect(reponse.body.tvaParTaux).toEqual([
      { taux: 18, base: 3_648_000, montant: 656_640 },
      { taux: 0, base: 576_000, montant: 0 },
    ]);
  });

  it('le prix appliqué dépend de la catégorie du client, avec repli sur le prix de détail', async () => {
    const b = await boutique();
    const prixPour = async (
      clientId: string | undefined,
      produitId: string,
    ) => {
      const vente = await b.http.post('/ventes', {
        emplacementId: b.depot.id,
        clientId,
        modePaiement: 'ESPECES',
        lignes: [{ produitId, quantite: 1 }],
      });
      return vente.body.lignes[0].prixUnitaire as number;
    };

    expect(await prixPour((await b.client('GROS')).id, b.ciment.id)).toBe(
      88_000,
    );
    expect(await prixPour((await b.client('DEMI_GROS')).id, b.ciment.id)).toBe(
      91_000,
    );
    expect(await prixPour((await b.client('DETAIL')).id, b.ciment.id)).toBe(
      95_000,
    );
    expect(await prixPour(undefined, b.ciment.id)).toBe(95_000);
    // Le fer n'a pas de prix de gros : un client « gros » paie le prix de détail.
    expect(await prixPour((await b.client('GROS')).id, b.fer.id)).toBe(148_000);
  });

  it('solde = ventes − règlements, après plusieurs règlements partiels', async () => {
    const b = await boutique();
    const client = await b.client('DETAIL');
    const vente = (
      await b.http.post('/ventes', {
        emplacementId: b.depot.id,
        clientId: client.id,
        modePaiement: 'CREDIT',
        avance: { montant: 100_000, mode: 'ESPECES' },
        echeanceAt: '2026-12-31T00:00:00.000Z',
        lignes: [{ produitId: b.riz.id, quantite: 2 }],
      })
    ).body;
    expect(vente.total).toBe(600_000);
    expect(await b.solde(client.id)).toBe(500_000);

    await b.http.post(`/ventes/${vente.id}/reglements`, {
      montant: 200_000,
      mode: 'ORANGE_MONEY',
    });
    await b.http.post(`/ventes/${vente.id}/reglements`, {
      montant: 150_000,
      mode: 'MTN_MOMO',
    });
    expect(await b.solde(client.id)).toBe(150_000);

    const tropPaye = await b.http.post(`/ventes/${vente.id}/reglements`, {
      montant: 150_001,
      mode: 'ESPECES',
    });
    expect(tropPaye.status).toBe(400);
    const modeCredit = await b.http.post(`/ventes/${vente.id}/reglements`, {
      montant: 1_000,
      mode: 'CREDIT',
    });
    expect(modeCredit.status).toBe(400);
    await b.http.post(`/ventes/${vente.id}/reglements`, {
      montant: 150_000,
      mode: 'ESPECES',
    });
    expect(await b.solde(client.id)).toBe(0);
  });

  it('annuler restitue le stock, marque ANNULEE et sort la vente du solde du client', async () => {
    const b = await boutique();
    const client = await b.client('DEMI_GROS');
    const vente = (
      await b.http.post('/ventes', {
        emplacementId: b.depot.id,
        clientId: client.id,
        modePaiement: 'CREDIT',
        avance: { montant: 500_000, mode: 'ESPECES' },
        lignes: [
          { produitId: b.ciment.id, quantite: 30 },
          { produitId: b.fer.id, quantite: 5 },
        ],
      })
    ).body;
    await b.http.post(`/ventes/${vente.id}/reglements`, {
      montant: 300_000,
      mode: 'ESPECES',
    });
    expect(await b.stock(b.ciment.id)).toBe(70);
    expect(await b.solde(client.id)).toBe(vente.total - 800_000);

    const sansMotif = await b.http.post(`/ventes/${vente.id}/annuler`, {});
    expect(sansMotif.status).toBe(400);
    const annulee = await b.http.post(`/ventes/${vente.id}/annuler`, {
      motif: 'Erreur de quantité',
    });

    expect(annulee.status).toBe(201);
    expect(annulee.body).toMatchObject({
      statut: 'ANNULEE',
      motifAnnulation: 'Erreur de quantité',
      montantARembourser: 800_000,
    });
    expect(await b.stock(b.ciment.id)).toBe(100);
    expect(await b.stock(b.fer.id)).toBe(50);
    expect(await b.solde(client.id)).toBe(0);
    expect(
      (await b.http.post(`/ventes/${vente.id}/annuler`, { motif: 'Encore' }))
        .status,
    ).toBe(409);
    expect(
      (
        await b.http.post(`/ventes/${vente.id}/reglements`, {
          montant: 1,
          mode: 'ESPECES',
        })
      ).status,
    ).toBe(409);
  });

  it('deux ventes simultanées reçoivent des numéros différents', async () => {
    const b = await boutique();
    const reponses = await Promise.all(
      Array.from({ length: 6 }, () =>
        b.http.post('/ventes', {
          emplacementId: b.depot.id,
          modePaiement: 'ESPECES',
          lignes: [{ produitId: b.fer.id, quantite: 1 }],
        }),
      ),
    );

    expect(reponses.every((r) => r.status === 201)).toBe(true);
    const numeros = reponses.map((r) => r.body.numero as string);
    expect(new Set(numeros).size).toBe(6);
    expect(
      numeros.map((n) => Number(n.split('-')[2])).sort((x, y) => x - y),
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('une vente à crédit exige un client ; avance et échéance sont réservées au crédit', async () => {
    const b = await boutique();
    const lignes = [{ produitId: b.fer.id, quantite: 1 }];
    expect(
      (
        await b.http.post('/ventes', {
          emplacementId: b.depot.id,
          modePaiement: 'CREDIT',
          lignes,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await b.http.post('/ventes', {
          emplacementId: b.depot.id,
          modePaiement: 'ESPECES',
          avance: { montant: 1, mode: 'ESPECES' },
          lignes,
        })
      ).status,
    ).toBe(400);
  });

  it('le plafond de crédit avertit sans jamais bloquer', async () => {
    const b = await boutique();
    const client = await b.client('DETAIL', 200_000);
    const reponse = await b.http.post('/ventes', {
      emplacementId: b.depot.id,
      clientId: client.id,
      modePaiement: 'CREDIT',
      lignes: [{ produitId: b.riz.id, quantite: 1 }],
    });

    expect(reponse.status).toBe(201);
    expect(reponse.body.alertePlafond).toEqual({
      plafondCredit: 200_000,
      solde: 300_000,
      depassement: 100_000,
    });
  });

  it('l’historique du client mêle ventes, règlements et annulations, du plus récent au plus ancien', async () => {
    const b = await boutique();
    const client = await b.client('DETAIL');
    const vente = (
      await b.http.post('/ventes', {
        emplacementId: b.depot.id,
        clientId: client.id,
        modePaiement: 'CREDIT',
        lignes: [{ produitId: b.fer.id, quantite: 1 }],
      })
    ).body;
    await b.http.post(`/ventes/${vente.id}/reglements`, {
      montant: 50_000,
      mode: 'ESPECES',
    });
    await b.http.post(`/ventes/${vente.id}/annuler`, { motif: 'Client parti' });

    const historique = await b.http.get(`/clients/${client.id}/historique`);
    expect(
      historique.body.evenements.map((e: { type: string }) => e.type),
    ).toEqual(['ANNULATION', 'REGLEMENT', 'VENTE']);
    expect(historique.body.solde).toBe(0);
  });

  it('isolation multi-tenant : ventes et clients d’une autre entreprise sont invisibles', async () => {
    const a = await boutique('Entreprise Ventes A');
    const b = await boutique('Entreprise Ventes B');
    const clientA = await a.client('DETAIL');
    const venteA = (
      await a.http.post('/ventes', {
        emplacementId: a.depot.id,
        clientId: clientA.id,
        modePaiement: 'CREDIT',
        lignes: [{ produitId: a.fer.id, quantite: 1 }],
      })
    ).body;

    expect(
      (await b.http.get('/ventes')).body.map((v: { id: string }) => v.id),
    ).not.toContain(venteA.id);
    expect((await b.http.get(`/ventes/${venteA.id}`)).status).toBe(404);
    expect(
      (
        await b.http.post(`/ventes/${venteA.id}/reglements`, {
          montant: 1,
          mode: 'ESPECES',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await b.http.post(`/ventes/${venteA.id}/annuler`, {
          motif: 'Intrusion',
        })
      ).status,
    ).toBe(404);
    expect((await b.http.get(`/clients/${clientA.id}/historique`)).status).toBe(
      404,
    );
    // B ne peut ni vendre le produit de A, ni à son client, ni depuis son dépôt.
    expect(
      (
        await b.http.post('/ventes', {
          emplacementId: b.depot.id,
          modePaiement: 'ESPECES',
          lignes: [{ produitId: a.fer.id, quantite: 1 }],
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await b.http.post('/ventes', {
          emplacementId: b.depot.id,
          clientId: clientA.id,
          modePaiement: 'CREDIT',
          lignes: [{ produitId: b.fer.id, quantite: 1 }],
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await b.http.post('/ventes', {
          emplacementId: a.depot.id,
          modePaiement: 'ESPECES',
          lignes: [{ produitId: b.fer.id, quantite: 1 }],
        })
      ).status,
    ).toBe(404);
  });
});
