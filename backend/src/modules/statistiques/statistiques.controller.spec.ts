import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import {
  connecterClient,
  creerEntrepriseAvecAdmin,
  nettoyer,
} from '../console/console-test.utils.js';
import { bornesPeriode } from './statistiques.service.js';

const JOUR_MS = 86_400_000;
const ilYA = (jours: number) => new Date(Date.now() - jours * JOUR_MS);

describe('Statistiques — intégration réelle, base PostgreSQL', () => {
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

  afterEach(async () => {
    await nettoyer(prisma, entrepriseIds.splice(0), []);
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Quincaillerie de test : ciment (catégorie Gros œuvre, 50 en stock),
   * peinture (Finitions, 2 en stock, sous son seuil de 5) et un produit
   * sans prix d'achat en rupture. Deux ventes sur les 30 derniers jours,
   * deux sur les 30 précédents, et une vente annulée qui ne compte pas.
   */
  async function creerQuincaillerie() {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(
      prisma,
      'Quincaillerie Stats',
    );
    entrepriseIds.push(entreprise.id);
    const entrepriseId = entreprise.id;
    const emplacement = await prisma.emplacement.create({
      data: { entrepriseId, nom: 'Magasin' },
    });
    const grosOeuvre = await prisma.categorie.create({
      data: { entrepriseId, nom: 'Gros œuvre' },
    });
    const finitions = await prisma.categorie.create({
      data: { entrepriseId, nom: 'Finitions' },
    });
    const ciment = await prisma.produit.create({
      data: {
        entrepriseId,
        nom: 'Ciment CPA 42.5',
        prixAchat: 70_000,
        seuilAlerte: 10,
        categorieId: grosOeuvre.id,
      },
    });
    const peinture = await prisma.produit.create({
      data: {
        entrepriseId,
        nom: 'Peinture 20 L',
        prixAchat: 80_000,
        seuilAlerte: 5,
        categorieId: finitions.id,
      },
    });
    const sansPrix = await prisma.produit.create({
      data: { entrepriseId, nom: 'Pointes', seuilAlerte: 3 },
    });
    await prisma.stock.createMany({
      data: [
        { produitId: ciment.id, emplacementId: emplacement.id, quantite: 50 },
        { produitId: peinture.id, emplacementId: emplacement.id, quantite: 2 },
        { produitId: sansPrix.id, emplacementId: emplacement.id, quantite: 0 },
      ],
    });

    let numero = 0;
    const vendre = async (
      date: Date,
      produitId: string,
      quantite: number,
      modePaiement: 'ESPECES' | 'ORANGE_MONEY',
      statut: 'VALIDEE' | 'ANNULEE' = 'VALIDEE',
    ) => {
      const total = quantite * 100_000;
      numero += 1;
      await prisma.vente.create({
        data: {
          entrepriseId,
          numero: `V-TEST-${numero}`,
          emplacementId: emplacement.id,
          utilisateurId: utilisateur.id,
          statut,
          sousTotal: total,
          montantTva: 0,
          total,
          modePaiement,
          createdAt: date,
          lignes: {
            create: {
              produitId,
              libelle: 'Ligne',
              quantite,
              prixUnitaire: 100_000,
              tauxTva: 0,
              montantLigne: total,
            },
          },
        },
      });
    };
    await vendre(ilYA(2), ciment.id, 10, 'ESPECES');
    await vendre(ilYA(5), peinture.id, 4, 'ORANGE_MONEY');
    await vendre(ilYA(3), ciment.id, 9, 'ESPECES', 'ANNULEE');
    await vendre(ilYA(40), ciment.id, 5, 'ESPECES');
    await vendre(ilYA(45), peinture.id, 8, 'ESPECES');

    // Ciment : +30 il y a 10 jours, −10 il y a 2 jours ; stock actuel 50.
    await prisma.mouvement.createMany({
      data: [
        {
          entrepriseId,
          produitId: ciment.id,
          emplacementId: emplacement.id,
          utilisateurId: utilisateur.id,
          type: 'ENTREE',
          quantite: 30,
          createdAt: ilYA(10),
        },
        {
          entrepriseId,
          produitId: ciment.id,
          emplacementId: emplacement.id,
          utilisateurId: utilisateur.id,
          type: 'SORTIE',
          quantite: 10,
          createdAt: ilYA(2),
        },
      ],
    });

    const connexion = await connecterClient(app, utilisateur.email);
    return { token: connexion.body.accessToken as string, ciment, peinture };
  }

  it('calcule le chiffre d’affaires, les indicateurs et leur comparaison avec la période précédente', async () => {
    const { token } = await creerQuincaillerie();
    const reponse = await request(app.getHttpServer())
      .get('/statistiques?periode=30j')
      .set('Authorization', `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    const s = reponse.body;
    expect(s.tendance).toHaveLength(30);
    expect(
      s.tendance.reduce(
        (t: number, p: { montant: number }) => t + p.montant,
        0,
      ),
    ).toBe(1_400_000);
    expect(s.chiffreAffaires).toEqual({
      valeur: 1_400_000,
      precedent: 1_300_000,
    });
    expect(s.ventes).toEqual({ valeur: 2, precedent: 2 });
    expect(s.panierMoyen).toEqual({ valeur: 700_000, precedent: 650_000 });
    // Coût des ventes : 10 × 70 000 + 4 × 80 000 = 1 020 000. Stock : 3 660 000 aujourd'hui,
    // 3 660 000 − 20 × 70 000 = 2 260 000 au début (+30 puis −10 ciment) ; moyenne 2 960 000.
    expect(s.rotation.valeur).toBe(0.34);
    expect(s.ventesParMode).toEqual([
      { mode: 'ESPECES', montant: 1_000_000 },
      { mode: 'ORANGE_MONEY', montant: 400_000 },
    ]);
  });

  it('classe les produits en hausse et en baisse, et répartit le stock', async () => {
    const { token, ciment, peinture } = await creerQuincaillerie();
    const { body } = await request(app.getHttpServer())
      .get('/statistiques?periode=30j')
      .set('Authorization', `Bearer ${token}`);

    expect(body.hausses).toEqual([
      {
        produitId: ciment.id,
        nom: 'Ciment CPA 42.5',
        montant: 1_000_000,
        precedent: 500_000,
        variation: 100,
      },
    ]);
    expect(body.baisses).toEqual([
      {
        produitId: peinture.id,
        nom: 'Peinture 20 L',
        montant: 400_000,
        precedent: 800_000,
        variation: -50,
      },
    ]);
    expect(body.valeurParCategorie).toEqual([
      { libelle: 'Gros œuvre', valeur: 3_500_000 },
      { libelle: 'Finitions', valeur: 160_000 },
    ]);
    expect(body.etatStock).toEqual({ enStock: 1, faible: 1, rupture: 1 });
  });

  it('reconstitue le niveau de stock hebdomadaire du produit le plus vendu (chandeliers)', async () => {
    const { token, ciment, peinture } = await creerQuincaillerie();
    const { body, status } = await request(app.getHttpServer())
      .get('/statistiques/stock-hebdo')
      .set('Authorization', `Bearer ${token}`);

    expect(status).toBe(200);
    expect(body.produit.id).toBe(ciment.id);
    expect(body.produits.map((p: { id: string }) => p.id)).toEqual([
      ciment.id,
      peinture.id,
    ]);
    expect(body.semaines).toHaveLength(12);
    expect(body.semaines[0].ouverture).toBe(30);
    expect(body.semaines[11].cloture).toBe(50);
    expect(
      Math.max(...body.semaines.map((s: { haut: number }) => s.haut)),
    ).toBe(60);
    expect(Math.min(...body.semaines.map((s: { bas: number }) => s.bas))).toBe(
      30,
    );
    expect(new Date(body.semaines[0].debut).getUTCDay()).toBe(1); // lundi
  });

  it('isole les entreprises et valide les paramètres', async () => {
    const { ciment } = await creerQuincaillerie();
    const autre = await creerEntrepriseAvecAdmin(prisma, 'Autre entreprise');
    entrepriseIds.push(autre.entreprise.id);
    const token = (await connecterClient(app, autre.utilisateur.email)).body
      .accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };

    const resume = await request(app.getHttpServer())
      .get('/statistiques')
      .set(auth);
    expect(resume.body.chiffreAffaires).toEqual({ valeur: 0, precedent: 0 });
    expect(resume.body.etatStock).toEqual({
      enStock: 0,
      faible: 0,
      rupture: 0,
    });

    const intrus = await request(app.getHttpServer())
      .get(`/statistiques/stock-hebdo?produitId=${ciment.id}`)
      .set(auth);
    expect(intrus.status).toBe(404);

    expect(
      (
        await request(app.getHttpServer())
          .get('/statistiques?periode=1an')
          .set(auth)
      ).status,
    ).toBe(400);
    expect(
      (await request(app.getHttpServer()).get('/statistiques')).status,
    ).toBe(401);
  });
});

describe('Bornes des périodes', () => {
  const maintenant = new Date(Date.UTC(2026, 9, 10, 15, 30));

  it('7 et 30 jours : période en cours incluse, période précédente de même durée', () => {
    const b = bornesPeriode('7j', maintenant);
    expect(b.debut.toISOString()).toBe('2026-10-04T00:00:00.000Z');
    expect(b.fin.toISOString()).toBe('2026-10-11T00:00:00.000Z');
    expect(b.debutPrecedent.toISOString()).toBe('2026-09-27T00:00:00.000Z');
    expect(bornesPeriode('30j', maintenant).debut.toISOString()).toBe(
      '2026-09-11T00:00:00.000Z',
    );
  });

  it('12 mois : du 1er novembre au mois en cours inclus', () => {
    const b = bornesPeriode('12m', maintenant);
    expect(b.debut.toISOString()).toBe('2025-11-01T00:00:00.000Z');
    expect(b.fin.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(b.debutPrecedent.toISOString()).toBe('2024-11-01T00:00:00.000Z');
  });
});
