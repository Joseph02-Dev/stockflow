import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import {
  connecterClient,
  creerEntrepriseAvecAdmin,
  nettoyer,
} from '../console/console-test.utils.js';

/** Date AAAA-MM-JJ décalée de `jours` par rapport à aujourd'hui (UTC). */
function dansJours(jours: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

describe('Suivi par lot (FEFO) — intégration réelle, base PostgreSQL', () => {
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

  async function contexte({ suiviParLot = true, prixAchat = 1000 } = {}) {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(
      prisma,
      'Boutique Lots',
    );
    entrepriseIds.push(entreprise.id);
    const token = (await connecterClient(app, utilisateur.email)).body
      .accessToken as string;
    const api = {
      post: (url: string, corps: object) =>
        request(app.getHttpServer())
          .post(url)
          .set('Authorization', `Bearer ${token}`)
          .send(corps),
      get: (url: string) =>
        request(app.getHttpServer())
          .get(url)
          .set('Authorization', `Bearer ${token}`),
      patch: (url: string, corps: object) =>
        request(app.getHttpServer())
          .patch(url)
          .set('Authorization', `Bearer ${token}`)
          .send(corps),
    };
    const produit = await api.post('/produits', {
      nom: 'Riz parfumé 25 kg',
      prixAchat,
      prixVente: 2000,
    });
    if (suiviParLot) {
      await prisma.produit.update({
        where: { id: produit.body.id },
        data: { suiviParLot: true },
      });
    }
    const madina = await api.post('/emplacements', { nom: 'Dépôt Madina' });
    const coyah = await api.post('/emplacements', { nom: 'Boutique Coyah' });
    return {
      api,
      entrepriseId: entreprise.id,
      produitId: produit.body.id as string,
      madinaId: madina.body.id as string,
      coyahId: coyah.body.id as string,
    };
  }

  async function quantiteStock(produitId: string, emplacementId: string) {
    const stock = await prisma.stock.findUnique({
      where: { produitId_emplacementId: { produitId, emplacementId } },
    });
    return stock?.quantite ?? 0;
  }

  /** Stock = Σ lots, pour chaque emplacement du produit. */
  async function verifierCoherence(produitId: string) {
    const stocks = await prisma.stock.findMany({ where: { produitId } });
    const lots = await prisma.lot.groupBy({
      by: ['emplacementId'],
      where: { produitId },
      _sum: { quantite: true },
    });
    const parEmplacement = new Map(
      lots.map((l) => [l.emplacementId, l._sum.quantite ?? 0]),
    );
    for (const s of stocks)
      expect(parEmplacement.get(s.emplacementId) ?? 0).toBe(s.quantite);
    for (const [emplacementId, somme] of parEmplacement) {
      expect(
        stocks.find((s) => s.emplacementId === emplacementId)?.quantite ?? 0,
      ).toBe(somme);
    }
  }

  async function recevoir(
    c: Awaited<ReturnType<typeof contexte>>,
    numeroLot: string,
    quantite: number,
    datePeremption: string,
    emplacementId = c.madinaId,
  ) {
    const r = await c.api.post('/mouvements/entree', {
      produitId: c.produitId,
      emplacementId,
      quantite,
      numeroLot,
      datePeremption,
    });
    expect(r.status).toBe(201);
    return r;
  }

  it('exige numéro de lot et date de péremption pour un produit suivi', async () => {
    const c = await contexte();
    const sansLot = await c.api.post('/mouvements/entree', {
      produitId: c.produitId,
      emplacementId: c.madinaId,
      quantite: 5,
    });
    expect(sansLot.status).toBe(400);
    const dateInvalide = await c.api.post('/mouvements/entree', {
      produitId: c.produitId,
      emplacementId: c.madinaId,
      quantite: 5,
      numeroLot: 'LOT-1',
      datePeremption: '2027-02-31',
    });
    expect(dateInvalide.status).toBe(400);
    expect(await prisma.lot.count({ where: { produitId: c.produitId } })).toBe(
      0,
    );
    expect(await quantiteStock(c.produitId, c.madinaId)).toBe(0);
  });

  it('crée le lot à la réception, puis le complète au même numéro (même date exigée)', async () => {
    const c = await contexte();
    await recevoir(c, 'LOT-A', 10, '2027-01-04');
    await recevoir(c, 'LOT-A', 5, '2027-01-04');
    const autreDate = await c.api.post('/mouvements/entree', {
      produitId: c.produitId,
      emplacementId: c.madinaId,
      quantite: 1,
      numeroLot: 'LOT-A',
      datePeremption: '2027-03-01',
    });
    expect(autreDate.status).toBe(409);
    const lots = await prisma.lot.findMany({
      where: { produitId: c.produitId },
    });
    expect(lots).toHaveLength(1);
    expect(lots[0].quantite).toBe(15);
    expect(await quantiteStock(c.produitId, c.madinaId)).toBe(15);
    const mouvements = await prisma.mouvement.findMany({
      where: { produitId: c.produitId },
    });
    expect(mouvements.every((m) => m.lotId === lots[0].id)).toBe(true);
  });

  it('sort en FEFO à travers plusieurs lots reçus dans le désordre : un mouvement par lot', async () => {
    const c = await contexte();
    await recevoir(c, 'LOT-2603-B', 10, '2027-06-30');
    await recevoir(c, 'LOT-2601-C', 4, '2027-01-04');
    await recevoir(c, 'LOT-2602-A', 6, '2027-03-15');

    const sortie = await c.api.post('/mouvements/sortie', {
      produitId: c.produitId,
      emplacementId: c.madinaId,
      quantite: 7,
    });
    expect(sortie.status).toBe(201);
    expect(sortie.body).toHaveLength(2);

    const lots = await prisma.lot.findMany({
      where: { produitId: c.produitId },
    });
    const parNumero = Object.fromEntries(
      lots.map((l) => [l.numero, l.quantite]),
    );
    expect(parNumero).toEqual({
      'LOT-2601-C': 0,
      'LOT-2602-A': 3,
      'LOT-2603-B': 10,
    });

    const sorties = await prisma.mouvement.findMany({
      where: { produitId: c.produitId, type: 'SORTIE' },
      include: { lot: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(sorties.map((m) => [m.lot?.numero, m.quantite])).toEqual([
      ['LOT-2601-C', 4],
      ['LOT-2602-A', 3],
    ]);
    expect(await quantiteStock(c.produitId, c.madinaId)).toBe(13);
    await verifierCoherence(c.produitId);
  });

  it('refuse en 409 une sortie supérieure à l’ensemble des lots, sans rien écrire', async () => {
    const c = await contexte();
    await recevoir(c, 'L1', 3, '2027-01-01');
    await recevoir(c, 'L2', 4, '2027-02-01');
    const avant = await prisma.mouvement.count({
      where: { produitId: c.produitId },
    });

    const sortie = await c.api.post('/mouvements/sortie', {
      produitId: c.produitId,
      emplacementId: c.madinaId,
      quantite: 8,
    });
    expect(sortie.status).toBe(409);
    expect(
      await prisma.mouvement.count({ where: { produitId: c.produitId } }),
    ).toBe(avant);
    const lots = await prisma.lot.findMany({
      where: { produitId: c.produitId },
      orderBy: { numero: 'asc' },
    });
    expect(lots.map((l) => l.quantite)).toEqual([3, 4]);
    expect(await quantiteStock(c.produitId, c.madinaId)).toBe(7);
  });

  it('transfère un lot désigné en conservant numéro, date de péremption et date de réception', async () => {
    const c = await contexte();
    await recevoir(c, 'LOT-X', 10, '2027-05-20');
    await recevoir(c, 'LOT-Y', 10, '2027-01-10');
    const source = await prisma.lot.findFirstOrThrow({
      where: { produitId: c.produitId, numero: 'LOT-X' },
    });

    const t = await c.api.post('/mouvements/transfert', {
      produitId: c.produitId,
      emplacementSourceId: c.madinaId,
      emplacementDestinationId: c.coyahId,
      quantite: 6,
      lotId: source.id,
    });
    expect(t.status).toBe(201);
    expect(t.body.type).toBe('TRANSFERT');
    expect(t.body.lotId).toBe(source.id);

    const arrivee = await prisma.lot.findFirstOrThrow({
      where: { produitId: c.produitId, emplacementId: c.coyahId },
    });
    expect(arrivee.numero).toBe('LOT-X');
    expect(arrivee.quantite).toBe(6);
    expect(arrivee.datePeremption?.toISOString()).toBe(
      source.datePeremption?.toISOString(),
    );
    expect(arrivee.recuAt.toISOString()).toBe(source.recuAt.toISOString());
    expect(
      (await prisma.lot.findUniqueOrThrow({ where: { id: source.id } }))
        .quantite,
    ).toBe(4);
    expect(await quantiteStock(c.produitId, c.coyahId)).toBe(6);
    await verifierCoherence(c.produitId);
  });

  it('transfère sans lot désigné dans l’ordre FEFO', async () => {
    const c = await contexte();
    await recevoir(c, 'TARD', 10, '2027-09-01');
    await recevoir(c, 'TOT', 3, '2027-01-01');
    const t = await c.api.post('/mouvements/transfert', {
      produitId: c.produitId,
      emplacementSourceId: c.madinaId,
      emplacementDestinationId: c.coyahId,
      quantite: 5,
    });
    expect(t.status).toBe(201);
    expect(t.body).toHaveLength(2);
    const arrivees = await prisma.lot.findMany({
      where: { produitId: c.produitId, emplacementId: c.coyahId },
      orderBy: { numero: 'asc' },
    });
    expect(arrivees.map((l) => [l.numero, l.quantite])).toEqual([
      ['TARD', 2],
      ['TOT', 3],
    ]);
    await verifierCoherence(c.produitId);
  });

  it('garde Stock = Σ lots au fil d’une suite d’opérations', async () => {
    const c = await contexte();
    await recevoir(c, 'A', 20, dansJours(40));
    await recevoir(c, 'B', 15, dansJours(10));
    await recevoir(c, 'C', 8, dansJours(90), c.coyahId);
    await c.api.post('/mouvements/sortie', {
      produitId: c.produitId,
      emplacementId: c.madinaId,
      quantite: 18,
    });
    await c.api.post('/mouvements/transfert', {
      produitId: c.produitId,
      emplacementSourceId: c.madinaId,
      emplacementDestinationId: c.coyahId,
      quantite: 9,
    });
    await c.api.post('/mouvements/sortie', {
      produitId: c.produitId,
      emplacementId: c.coyahId,
      quantite: 4,
    });
    await recevoir(c, 'A', 2, dansJours(40));
    await verifierCoherence(c.produitId);
    expect(await quantiteStock(c.produitId, c.madinaId)).toBe(10);
    expect(await quantiteStock(c.produitId, c.coyahId)).toBe(13);
  });

  it('produit sans suivi par lot : mêmes opérations qu’avant, aucun lot, numéro de lot refusé', async () => {
    const c = await contexte({ suiviParLot: false });
    const entree = await c.api.post('/mouvements/entree', {
      produitId: c.produitId,
      emplacementId: c.madinaId,
      quantite: 30,
    });
    expect(entree.status).toBe(201);
    expect(entree.body.lotId).toBeNull();
    const sortie = await c.api.post('/mouvements/sortie', {
      produitId: c.produitId,
      emplacementId: c.madinaId,
      quantite: 7,
    });
    expect(sortie.status).toBe(201);
    expect(sortie.body.type).toBe('SORTIE');
    const transfert = await c.api.post('/mouvements/transfert', {
      produitId: c.produitId,
      emplacementSourceId: c.madinaId,
      emplacementDestinationId: c.coyahId,
      quantite: 3,
    });
    expect(transfert.status).toBe(201);
    expect(transfert.body.type).toBe('TRANSFERT');
    const avecLot = await c.api.post('/mouvements/entree', {
      produitId: c.produitId,
      emplacementId: c.madinaId,
      quantite: 1,
      numeroLot: 'LOT-1',
      datePeremption: '2027-01-01',
    });
    expect(avecLot.status).toBe(400);
    expect(await prisma.lot.count({ where: { produitId: c.produitId } })).toBe(
      0,
    );
    expect(await quantiteStock(c.produitId, c.madinaId)).toBe(20);
    expect(await quantiteStock(c.produitId, c.coyahId)).toBe(3);
  });

  describe('Péremptions', () => {
    it('classe les lots par tranche aux bornes de 7 et 30 jours, avec unités et valeur au prix d’achat', async () => {
      const c = await contexte({ prixAchat: 1500 });
      await recevoir(c, 'J-1', 1, dansJours(-1));
      await recevoir(c, 'J0', 2, dansJours(0));
      await recevoir(c, 'J7', 3, dansJours(7));
      await recevoir(c, 'J8', 4, dansJours(8));
      await recevoir(c, 'J30', 5, dansJours(30));
      await recevoir(c, 'J31', 6, dansJours(31));

      const resume = await c.api.get('/peremptions');
      expect(resume.status).toBe(200);
      expect(resume.body.tranches).toEqual([
        { tranche: 'PERIME', lots: 1, unites: 1, valeur: 1500 },
        { tranche: 'MOINS_7', lots: 2, unites: 5, valeur: 7500 },
        { tranche: 'DE_8_A_30', lots: 2, unites: 9, valeur: 13500 },
        { tranche: 'PLUS_30', lots: 1, unites: 6, valeur: 9000 },
      ]);
      // Seuil de l'entreprise : 30 jours — J31 n'est pas sous surveillance.
      expect(resume.body.sousSurveillance).toBe(5);

      const liste = await c.api.get('/peremptions/lots');
      expect(liste.body.map((l: { numero: string }) => l.numero)).toEqual([
        'J-1',
        'J0',
        'J7',
        'J8',
        'J30',
        'J31',
      ]);
      expect(
        liste.body.map((l: { joursRestants: number }) => l.joursRestants),
      ).toEqual([-1, 0, 7, 8, 30, 31]);
      expect(liste.body[2]).toMatchObject({
        tranche: 'MOINS_7',
        valeur: 4500,
        emplacement: { nom: 'Dépôt Madina' },
      });

      const urgents = await c.api.get('/peremptions/lots?tranche=DE_8_A_30');
      expect(urgents.body.map((l: { numero: string }) => l.numero)).toEqual([
        'J8',
        'J30',
      ]);
    });

    it('applique le seuil propre au produit plutôt que celui de l’entreprise', async () => {
      const c = await contexte();
      await prisma.produit.update({
        where: { id: c.produitId },
        data: { seuilAlertePeremption: 60 },
      });
      await recevoir(c, 'J45', 1, dansJours(45));
      await recevoir(c, 'J90', 1, dansJours(90));
      expect((await c.api.get('/peremptions')).body.sousSurveillance).toBe(1);
    });

    it('retrouve le fournisseur du lot, même après un transfert', async () => {
      const c = await contexte();
      const fournisseur = await c.api.post('/fournisseurs', {
        nom: 'Riz du Fouta',
      });
      await c.api.post('/mouvements/entree', {
        produitId: c.produitId,
        emplacementId: c.madinaId,
        quantite: 10,
        numeroLot: 'LOT-F',
        datePeremption: dansJours(20),
        fournisseurId: fournisseur.body.id,
      });
      await c.api.post('/mouvements/transfert', {
        produitId: c.produitId,
        emplacementSourceId: c.madinaId,
        emplacementDestinationId: c.coyahId,
        quantite: 4,
      });
      const liste = await c.api.get('/peremptions/lots');
      expect(liste.body).toHaveLength(2);
      for (const lot of liste.body)
        expect(lot.fournisseur?.nom).toBe('Riz du Fouta');
    });

    it('sort un lot périmé du stock par un mouvement PERIME ; refuse un lot non périmé', async () => {
      const c = await contexte();
      await recevoir(c, 'VIEUX', 6, dansJours(-3));
      await recevoir(c, 'FRAIS', 4, dansJours(100));
      const vieux = await prisma.lot.findFirstOrThrow({
        where: { produitId: c.produitId, numero: 'VIEUX' },
      });
      const frais = await prisma.lot.findFirstOrThrow({
        where: { produitId: c.produitId, numero: 'FRAIS' },
      });

      expect(
        (await c.api.post(`/peremptions/lots/${frais.id}/sortir`, {})).status,
      ).toBe(409);

      const sortie = await c.api.post(
        `/peremptions/lots/${vieux.id}/sortir`,
        {},
      );
      expect(sortie.status).toBe(201);
      expect(sortie.body).toMatchObject({
        type: 'PERIME',
        quantite: 6,
        lotId: vieux.id,
      });
      expect(
        (await prisma.lot.findUniqueOrThrow({ where: { id: vieux.id } }))
          .quantite,
      ).toBe(0);
      expect(await quantiteStock(c.produitId, c.madinaId)).toBe(4);
      await verifierCoherence(c.produitId);

      expect(
        (await c.api.post(`/peremptions/lots/${vieux.id}/sortir`, {})).status,
      ).toBe(409);
    });

    it('isole les lots par entreprise', async () => {
      const a = await contexte();
      const b = await contexte();
      await recevoir(a, 'A-PERIME', 3, dansJours(-2));
      const lot = await prisma.lot.findFirstOrThrow({
        where: { produitId: a.produitId },
      });

      expect((await b.api.get('/peremptions/lots')).body).toEqual([]);
      expect((await b.api.get('/peremptions')).body.sousSurveillance).toBe(0);
      expect(
        (await b.api.post(`/peremptions/lots/${lot.id}/sortir`, {})).status,
      ).toBe(404);
      expect((await b.api.get(`/produits/${a.produitId}/lots`)).body).toEqual(
        [],
      );
      expect(
        (await prisma.lot.findUniqueOrThrow({ where: { id: lot.id } }))
          .quantite,
      ).toBe(3);
    });

    it('liste les lots d’un produit en ordre FEFO et marque celui qui sortira en premier', async () => {
      const c = await contexte();
      await recevoir(c, 'B', 2, '2027-06-30');
      await recevoir(c, 'A', 2, '2027-01-04');
      const lots = await c.api.get(
        `/produits/${c.produitId}/lots?emplacement_id=${c.madinaId}`,
      );
      expect(
        lots.body.map((l: { numero: string; sortiraEnPremier: boolean }) => [
          l.numero,
          l.sortiraEnPremier,
        ]),
      ).toEqual([
        ['A', true],
        ['B', false],
      ]);
    });
  });
});
