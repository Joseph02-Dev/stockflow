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

describe('Retours fournisseur — intégration réelle, base PostgreSQL', () => {
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

  async function contexte(nom = 'Quincaillerie Retours') {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(
      prisma,
      nom,
    );
    entrepriseIds.push(entreprise.id);
    const admin = clientApi(
      app,
      (await connecterClient(app, utilisateur.email)).body.accessToken,
    );
    const produit = await admin.post('/produits', {
      nom: 'Fer à béton 12 mm',
      prixAchat: 60000,
      prixVente: 75000,
    });
    const depot = await admin.post('/emplacements', { nom: 'Dépôt Madina' });
    const fournisseur = await admin.post('/fournisseurs', {
      nom: 'Sotelgui Matériaux',
    });
    await admin.post('/mouvements/entree', {
      produitId: produit.body.id,
      emplacementId: depot.body.id,
      quantite: 50,
    });
    return {
      admin,
      entrepriseId: entreprise.id,
      produitId: produit.body.id as string,
      depotId: depot.body.id as string,
      fournisseurId: fournisseur.body.id as string,
    };
  }

  const stock = async (produitId: string, emplacementId: string) =>
    (
      await prisma.stock.findUnique({
        where: { produitId_emplacementId: { produitId, emplacementId } },
      })
    )?.quantite ?? 0;

  const creer = (c: Awaited<ReturnType<typeof contexte>>, quantite = 5) =>
    c.admin.post('/retours-fournisseur', {
      fournisseurId: c.fournisseurId,
      emplacementId: c.depotId,
      motif: 'Barres tordues à la livraison',
      lignes: [{ produitId: c.produitId, quantite }],
    });

  it('créer un retour décrémente le stock, valeur figée au prix d’achat, avoir attendu', async () => {
    const c = await contexte();
    const r = await creer(c, 5);
    expect(r.status).toBe(201);
    expect(r.body.statutAvoir).toBe('ATTENDU');
    expect(r.body.valeurTotale).toBe(300000);
    expect(await stock(c.produitId, c.depotId)).toBe(45);
    const mouvements = await prisma.mouvement.findMany({
      where: { retourFournisseurId: r.body.id },
    });
    expect(mouvements).toHaveLength(1);
    expect(mouvements[0]).toMatchObject({
      type: 'RETOUR_FOURNISSEUR',
      quantite: 5,
      valeurUnitaire: 60000,
      valeurTotale: 300000,
    });

    await c.admin.patch(`/produits/${c.produitId}`, { prixAchat: 99000 });
    const liste = await c.admin.get('/retours-fournisseur');
    expect(liste.body.retours[0].valeurTotale).toBe(300000);
    expect(liste.body.avoirsEnAttente).toEqual({ nombre: 1, valeur: 300000 });
  });

  it('plus que le stock → 409, rien n’est écrit', async () => {
    const c = await contexte();
    const r = await creer(c, 80);
    expect(r.status).toBe(409);
    expect(await stock(c.produitId, c.depotId)).toBe(50);
    expect(
      await prisma.retourFournisseur.count({
        where: { entrepriseId: c.entrepriseId },
      }),
    ).toBe(0);
  });

  it('avoir REFUSE : aucune seconde sortie de stock, statut figé ensuite', async () => {
    const c = await contexte();
    const r = await creer(c, 5);
    const refus = await c.admin.patch(
      `/retours-fournisseur/${r.body.id}/avoir`,
      { statut: 'REFUSE' },
    );
    expect(refus.status).toBe(200);
    expect(refus.body.statutAvoir).toBe('REFUSE');
    expect(await stock(c.produitId, c.depotId)).toBe(45);
    expect(
      await prisma.mouvement.count({
        where: { entrepriseId: c.entrepriseId, type: 'RETOUR_FOURNISSEUR' },
      }),
    ).toBe(1);

    const encore = await c.admin.patch(
      `/retours-fournisseur/${r.body.id}/avoir`,
      { statut: 'RECU' },
    );
    expect(encore.status).toBe(409);
    const invalide = await c.admin.patch(
      `/retours-fournisseur/${r.body.id}/avoir`,
      { statut: 'ATTENDU' },
    );
    expect(invalide.status).toBe(400);
  });

  it('les retours refusés comptent dans les pertes une seule fois ; reçus et attendus non', async () => {
    const c = await contexte();
    const refuse = await creer(c, 5);
    const recu = await creer(c, 2);
    await creer(c, 1);
    await c.admin.patch(`/retours-fournisseur/${refuse.body.id}/avoir`, {
      statut: 'REFUSE',
    });
    await c.admin.patch(`/retours-fournisseur/${recu.body.id}/avoir`, {
      statut: 'RECU',
    });
    await c.admin.post('/pertes', {
      produitId: c.produitId,
      emplacementId: c.depotId,
      quantite: 1,
      motif: 'VOL',
    });

    const s = await c.admin.get('/pertes/synthese');
    expect(s.status).toBe(200);
    expect(s.body.total).toBe(300000 + 60000);
    expect(s.body.nombre).toBe(2);
    const parMotif = Object.fromEntries(
      s.body.parMotif.map((m: { motif: string; valeur: number }) => [
        m.motif,
        m.valeur,
      ]),
    );
    expect(parMotif.AVOIR_REFUSE).toBe(300000);
    expect(parMotif.VOL).toBe(60000);
    // La liste des déclarations reste celle des casses : pas de doublon.
    const pertes = await c.admin.get('/pertes');
    expect(pertes.body).toHaveLength(1);
  });

  it('isolation multi-entreprise sur /retours-fournisseur', async () => {
    const a = await contexte('Entreprise A');
    const b = await contexte('Entreprise B');
    const r = await creer(a, 3);

    expect(
      (await b.admin.get('/retours-fournisseur')).body.retours,
    ).toHaveLength(0);
    expect(
      (
        await b.admin.patch(`/retours-fournisseur/${r.body.id}/avoir`, {
          statut: 'REFUSE',
        })
      ).status,
    ).toBe(404);
    // Fournisseur, dépôt ou produit d'une autre entreprise : refusés.
    const croise = await b.admin.post('/retours-fournisseur', {
      fournisseurId: a.fournisseurId,
      emplacementId: b.depotId,
      motif: 'Tentative croisée',
      lignes: [{ produitId: b.produitId, quantite: 1 }],
    });
    expect(croise.status).toBe(404);
    const produitAutre = await b.admin.post('/retours-fournisseur', {
      fournisseurId: b.fournisseurId,
      emplacementId: b.depotId,
      motif: 'Tentative croisée',
      lignes: [{ produitId: a.produitId, quantite: 1 }],
    });
    expect(produitAutre.status).toBe(404);
    expect(await stock(a.produitId, a.depotId)).toBe(47);
    expect(
      (
        await prisma.retourFournisseur.findUniqueOrThrow({
          where: { id: r.body.id },
        })
      ).statutAvoir,
    ).toBe('ATTENDU');
  });
});
