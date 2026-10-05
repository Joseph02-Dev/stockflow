import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import {
  MOT_DE_PASSE_TEST,
  connecterClient,
  creerEntrepriseAvecAdmin,
  nettoyer,
} from '../console/console-test.utils.js';

function clientApi(app: INestApplication, token: string) {
  return {
    post: (url: string, corps: object = {}) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${token}`)
        .send(corps),
    patch: (url: string, corps: object = {}) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${token}`)
        .send(corps),
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${token}`),
  };
}

describe('Pertes (casse) — intégration réelle, base PostgreSQL', () => {
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

  async function contexte({ prixAchat = 72000 } = {}) {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(
      prisma,
      'Quincaillerie Pertes',
    );
    entrepriseIds.push(entreprise.id);
    const admin = clientApi(
      app,
      (await connecterClient(app, utilisateur.email)).body.accessToken,
    );
    const emailGestionnaire = `gest-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    await prisma.utilisateur.create({
      data: {
        entrepriseId: entreprise.id,
        email: emailGestionnaire,
        nom: 'Magasinier Test',
        passwordHash: await argon2.hash(MOT_DE_PASSE_TEST),
        role: 'GESTIONNAIRE',
        emailVerifieAt: new Date(),
      },
    });
    const gestionnaire = clientApi(
      app,
      (await connecterClient(app, emailGestionnaire)).body.accessToken,
    );
    const produit = await admin.post('/produits', {
      nom: 'Ciment Portland 50 kg',
      prixAchat,
      prixVente: 95000,
    });
    const depot = await admin.post('/emplacements', { nom: 'Dépôt Madina' });
    await admin.post('/mouvements/entree', {
      produitId: produit.body.id,
      emplacementId: depot.body.id,
      quantite: 100,
    });
    return {
      admin,
      gestionnaire,
      entrepriseId: entreprise.id,
      produitId: produit.body.id as string,
      depotId: depot.body.id as string,
    };
  }

  const stock = async (produitId: string, emplacementId: string) =>
    (
      await prisma.stock.findUnique({
        where: { produitId_emplacementId: { produitId, emplacementId } },
      })
    )?.quantite ?? 0;

  it('un gestionnaire déclare une casse : stock décrémenté, mouvement CASSE, valeur au prix d’achat', async () => {
    const c = await contexte();
    const r = await c.gestionnaire.post('/pertes', {
      produitId: c.produitId,
      emplacementId: c.depotId,
      quantite: 8,
      motif: 'CASSE_MANUTENTION',
      commentaire: '  Sacs éventrés au déchargement  ',
      photoUrl: 'https://res.cloudinary.com/demo/image/upload/sac.jpg',
    });
    expect(r.status).toBe(201);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({
      quantite: 8,
      motifPerte: 'CASSE_MANUTENTION',
      valeurUnitaire: 72000,
      valeurTotale: 576000,
      commentaire: 'Sacs éventrés au déchargement',
      utilisateur: { nom: 'Magasinier Test' },
    });
    expect(await stock(c.produitId, c.depotId)).toBe(92);
    const mouvement = await prisma.mouvement.findUniqueOrThrow({
      where: { id: r.body[0].id },
    });
    expect(mouvement.type).toBe('CASSE');
  });

  it('exige le motif (400) et refuse un motif hors liste', async () => {
    const c = await contexte();
    const corps = {
      produitId: c.produitId,
      emplacementId: c.depotId,
      quantite: 2,
    };
    expect((await c.gestionnaire.post('/pertes', corps)).status).toBe(400);
    expect(
      (await c.gestionnaire.post('/pertes', { ...corps, motif: 'PLUIE' }))
        .status,
    ).toBe(400);
    expect(await stock(c.produitId, c.depotId)).toBe(100);
  });

  it('fige la valeur au prix d’achat du moment : changer le prix ensuite ne modifie pas la perte', async () => {
    const c = await contexte();
    const r = await c.gestionnaire.post('/pertes', {
      produitId: c.produitId,
      emplacementId: c.depotId,
      quantite: 3,
      motif: 'VOL',
    });
    await c.admin.patch(`/produits/${c.produitId}`, { prixAchat: 90000 });
    const perte = await prisma.mouvement.findUniqueOrThrow({
      where: { id: r.body[0].id },
    });
    expect([perte.valeurUnitaire, perte.valeurTotale]).toEqual([72000, 216000]);
  });

  it('refuse en 409 une quantité supérieure au stock, sans rien écrire', async () => {
    const c = await contexte();
    const r = await c.gestionnaire.post('/pertes', {
      produitId: c.produitId,
      emplacementId: c.depotId,
      quantite: 101,
      motif: 'VOL',
    });
    expect(r.status).toBe(409);
    expect(await stock(c.produitId, c.depotId)).toBe(100);
    expect(
      await prisma.mouvement.count({
        where: { produitId: c.produitId, type: 'CASSE' },
      }),
    ).toBe(0);
  });

  it('seul un administrateur annule ; l’annulation crée le mouvement inverse et restitue le stock', async () => {
    const c = await contexte();
    const r = await c.gestionnaire.post('/pertes', {
      produitId: c.produitId,
      emplacementId: c.depotId,
      quantite: 6,
      motif: 'ERREUR_SAISIE',
    });
    const id = r.body[0].id as string;
    expect(
      (await c.gestionnaire.post(`/pertes/${id}/annuler`, { motif: 'Erreur' }))
        .status,
    ).toBe(403);
    expect((await c.admin.post(`/pertes/${id}/annuler`, {})).status).toBe(400);

    const annulation = await c.admin.post(`/pertes/${id}/annuler`, {
      motif: 'Sacs retrouvés intacts',
    });
    expect(annulation.status).toBe(200);
    expect(annulation.body).toMatchObject({
      motifAnnulation: 'Sacs retrouvés intacts',
      quantite: 6,
      valeurTotale: 432000,
    });
    expect(annulation.body.annuleAt).not.toBeNull();
    expect(await stock(c.produitId, c.depotId)).toBe(100);
    const inverse = await prisma.mouvement.findFirstOrThrow({
      where: { annuleMouvementId: id },
    });
    expect([inverse.type, inverse.quantite]).toEqual(['AJUSTEMENT', 6]);
    expect(
      (await c.admin.post(`/pertes/${id}/annuler`, { motif: 'Encore' })).status,
    ).toBe(409);

    // La déclaration reste visible, marquée annulée.
    const liste = await c.admin.get('/pertes');
    expect(
      liste.body.map((p: { id: string; annuleAt: string | null }) => [
        p.id,
        p.annuleAt !== null,
      ]),
    ).toEqual([[id, true]]);
  });

  it('produit suivi par lot : casse sur le lot désigné, annulation dans le même lot', async () => {
    const c = await contexte();
    const riz = await c.admin.post('/produits', {
      nom: 'Riz 25 kg',
      prixAchat: 285000,
      suiviParLot: true,
    });
    for (const [numeroLot, datePeremption] of [
      ['A', '2027-01-01'],
      ['B', '2027-06-01'],
    ]) {
      await c.admin.post('/mouvements/entree', {
        produitId: riz.body.id,
        emplacementId: c.depotId,
        quantite: 10,
        numeroLot,
        datePeremption,
      });
    }
    const lotB = await prisma.lot.findFirstOrThrow({
      where: { produitId: riz.body.id, numero: 'B' },
    });
    const r = await c.gestionnaire.post('/pertes', {
      produitId: riz.body.id,
      emplacementId: c.depotId,
      quantite: 4,
      motif: 'DEGAT_EAUX',
      lotId: lotB.id,
    });
    expect(r.status).toBe(201);
    expect(r.body[0].lot.numero).toBe('B');
    expect(
      (await prisma.lot.findUniqueOrThrow({ where: { id: lotB.id } })).quantite,
    ).toBe(6);
    await c.admin.post(`/pertes/${r.body[0].id}/annuler`, {
      motif: 'Erreur de lot',
    });
    expect(
      (await prisma.lot.findUniqueOrThrow({ where: { id: lotB.id } })).quantite,
    ).toBe(10);
  });

  it('filtre l’historique par motif et isole les entreprises', async () => {
    const a = await contexte();
    const b = await contexte();
    await a.gestionnaire.post('/pertes', {
      produitId: a.produitId,
      emplacementId: a.depotId,
      quantite: 1,
      motif: 'VOL',
    });
    const casse = await a.gestionnaire.post('/pertes', {
      produitId: a.produitId,
      emplacementId: a.depotId,
      quantite: 2,
      motif: 'DEGAT_EAUX',
    });
    expect((await a.admin.get('/pertes?motif=DEGAT_EAUX')).body).toHaveLength(
      1,
    );
    expect((await b.admin.get('/pertes')).body).toEqual([]);
    expect(
      (
        await b.admin.post(`/pertes/${casse.body[0].id}/annuler`, {
          motif: 'Intrusion',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await b.gestionnaire.post('/pertes', {
          produitId: a.produitId,
          emplacementId: a.depotId,
          quantite: 1,
          motif: 'VOL',
        })
      ).status,
    ).toBe(404);
    expect(await stock(a.produitId, a.depotId)).toBe(97);
  });

  describe('Synthèse', () => {
    it('totalise par motif, exclut les casses annulées, et rapporte la perte à la valeur du stock', async () => {
      const c = await contexte();
      const declarer = (quantite: number, motif: string) =>
        c.gestionnaire.post('/pertes', {
          produitId: c.produitId,
          emplacementId: c.depotId,
          quantite,
          motif,
        });
      await declarer(8, 'CASSE_MANUTENTION');
      await declarer(2, 'CASSE_MANUTENTION');
      await declarer(1, 'VOL');
      const annulee = await declarer(5, 'DEGAT_EAUX');
      await c.admin.post(`/pertes/${annulee.body[0].id}/annuler`, {
        motif: 'Erreur',
      });

      const s = (await c.admin.get('/pertes/synthese')).body;
      expect(s.total).toBe(11 * 72000);
      expect(s.nombre).toBe(3);
      expect(s.moyenne).toBe(264000);
      const motif = (m: string) =>
        s.parMotif.find((p: { motif: string }) => p.motif === m);
      expect(motif('CASSE_MANUTENTION')).toEqual({
        motif: 'CASSE_MANUTENTION',
        valeur: 720000,
        nombre: 2,
      });
      expect(motif('VOL')).toEqual({ motif: 'VOL', valeur: 72000, nombre: 1 });
      expect(motif('DEGAT_EAUX')).toEqual({
        motif: 'DEGAT_EAUX',
        valeur: 0,
        nombre: 0,
      });
      // Stock restant : 89 sacs × 72 000.
      expect(s.valeurStock).toBe(89 * 72000);
      expect(s.partDuStock).toBe(
        Math.round((792000 * 1000) / (89 * 72000)) / 10,
      );
    });

    it('calcule la phrase d’analyse depuis les données : concentration et motif en hausse', async () => {
      const c = await contexte();
      const coyah = await c.admin.post('/emplacements', {
        nom: 'Boutique Coyah',
      });
      await c.admin.post('/mouvements/entree', {
        produitId: c.produitId,
        emplacementId: coyah.body.id,
        quantite: 100,
      });
      // Avant : 1 sac d'eau à Madina, il y a 4 mois ; ce mois-ci : 3 sacs d'eau à Madina, 1 cassé à Coyah.
      const ancienne = await c.gestionnaire.post('/pertes', {
        produitId: c.produitId,
        emplacementId: c.depotId,
        quantite: 1,
        motif: 'DEGAT_EAUX',
      });
      const ilYaQuatreMois = new Date();
      ilYaQuatreMois.setUTCMonth(ilYaQuatreMois.getUTCMonth() - 4, 15);
      await prisma.mouvement.update({
        where: { id: ancienne.body[0].id },
        data: { createdAt: ilYaQuatreMois },
      });
      await c.gestionnaire.post('/pertes', {
        produitId: c.produitId,
        emplacementId: c.depotId,
        quantite: 3,
        motif: 'DEGAT_EAUX',
      });
      await c.gestionnaire.post('/pertes', {
        produitId: c.produitId,
        emplacementId: coyah.body.id,
        quantite: 1,
        motif: 'CASSE_MANUTENTION',
      });

      const s = (await c.admin.get('/pertes/synthese')).body;
      expect(
        s.parEmplacement.map((e: { nom: string; partPertes: number }) => [
          e.nom,
          e.partPertes,
        ]),
      ).toEqual([
        ['Dépôt Madina', 75],
        ['Boutique Coyah', 25],
      ]);
      const depuis = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 2, 1),
      ).toLocaleDateString('fr-FR', {
        month: 'long',
        timeZone: 'UTC',
      });
      // Stock : Madina 96 sacs, Coyah 99 sacs → 49 % du stock.
      expect(s.analyse).toBe(
        `« Dépôt Madina » concentre 75 % des pertes pour 49 % du stock. Les dégâts des eaux y ont triplé depuis ${depuis}.`,
      );
      expect(s.evolution).toHaveLength(6);
      expect(s.evolution[1].valeur).toBe(72000);
    });

    it('isole les entreprises et valide le mois', async () => {
      const a = await contexte();
      const b = await contexte();
      await a.gestionnaire.post('/pertes', {
        produitId: a.produitId,
        emplacementId: a.depotId,
        quantite: 4,
        motif: 'VOL',
      });
      expect((await b.admin.get('/pertes/synthese')).body).toMatchObject({
        total: 0,
        nombre: 0,
        analyse: null,
      });
      expect((await a.admin.get('/pertes/synthese?mois=2026-13')).status).toBe(
        400,
      );
    });
  });
});
