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

describe('Retours client — intégration réelle, base PostgreSQL', () => {
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

  async function contexte(nom = 'Quincaillerie Retours Client') {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(
      prisma,
      nom,
    );
    entrepriseIds.push(entreprise.id);
    const http = clientApi(
      app,
      (await connecterClient(app, utilisateur.email)).body.accessToken,
    );
    const ciment = await http.post('/produits', {
      nom: 'Ciment Portland 50 kg',
      prixAchat: 72000,
      prixVente: 95000,
    });
    const depot = await http.post('/emplacements', { nom: 'Dépôt Madina' });
    const client = await http.post('/clients', {
      nom: 'Mamadou Bah',
      telephone: '+224 622 45 18 03',
    });
    const fournisseur = await http.post('/fournisseurs', {
      nom: 'Ciments de Guinée',
    });
    await http.post('/mouvements/entree', {
      produitId: ciment.body.id,
      emplacementId: depot.body.id,
      quantite: 100,
    });
    return {
      http,
      entrepriseId: entreprise.id,
      cimentId: ciment.body.id as string,
      depotId: depot.body.id as string,
      clientId: client.body.id as string,
      fournisseurId: fournisseur.body.id as string,
    };
  }
  type Contexte = Awaited<ReturnType<typeof contexte>>;

  const stock = async (c: Contexte, produitId = c.cimentId) =>
    (
      await prisma.stock.findUnique({
        where: {
          produitId_emplacementId: { produitId, emplacementId: c.depotId },
        },
      })
    )?.quantite ?? 0;

  /** Vente de 10 sacs à 95 000, remise 10 % : 855 000 GNF. */
  async function vendre(c: Contexte, credit = false) {
    const r = await c.http.post('/ventes', {
      emplacementId: c.depotId,
      ...(credit
        ? { clientId: c.clientId, modePaiement: 'CREDIT' }
        : { modePaiement: 'ESPECES' }),
      tauxRemise: 10,
      lignes: [{ produitId: c.cimentId, quantite: 10 }],
    });
    expect(r.status).toBe(201);
    return {
      venteId: r.body.id as string,
      ligneId: r.body.lignes[0].id as string,
    };
  }

  const retourner = (
    c: Contexte,
    venteId: string,
    corps: Record<string, unknown>,
  ) => c.http.post(`/ventes/${venteId}/retour`, corps);

  it('remettre en stock : un seul RETOUR_CLIENT, le stock remonte, montant au prix facturé', async () => {
    const c = await contexte();
    const { venteId, ligneId } = await vendre(c);
    expect(await stock(c)).toBe(90);
    const r = await retourner(c, venteId, {
      lignes: [{ ligneVenteId: ligneId, quantite: 2 }],
      etat: 'REMISE_EN_STOCK',
      compensation: 'REMBOURSEMENT',
    });
    expect(r.status).toBe(201);
    // 2 × 95 000, moins 10 % de remise.
    expect(r.body.montant).toBe(171000);
    expect(await stock(c)).toBe(92);
    const mouvements = await prisma.mouvement.findMany({
      where: { retourClientId: r.body.id },
    });
    expect(mouvements.map((m) => [m.type, m.quantite])).toEqual([
      ['RETOUR_CLIENT', 2],
    ]);
    // Remboursement en espèces : aucun règlement créé.
    expect(
      await prisma.reglement.count({ where: { venteId, mode: 'AVOIR' } }),
    ).toBe(0);
  });

  it('déclarer en casse : RETOUR_CLIENT puis CASSE, stock net inchangé, perte au prix d’achat', async () => {
    const c = await contexte();
    const { venteId, ligneId } = await vendre(c);
    const r = await retourner(c, venteId, {
      lignes: [{ ligneVenteId: ligneId, quantite: 3 }],
      etat: 'CASSE',
      motifPerte: 'CASSE_MANUTENTION',
      compensation: 'REMBOURSEMENT',
    });
    expect(r.status).toBe(201);
    expect(await stock(c)).toBe(90);
    const mouvements = await prisma.mouvement.findMany({
      where: { retourClientId: r.body.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(mouvements.map((m) => [m.type, m.quantite])).toEqual([
      ['RETOUR_CLIENT', 3],
      ['CASSE', 3],
    ]);
    expect(mouvements[1]).toMatchObject({
      motifPerte: 'CASSE_MANUTENTION',
      valeurUnitaire: 72000,
      valeurTotale: 216000,
    });
    const s = await c.http.get('/pertes/synthese');
    expect(s.body.total).toBe(216000);

    const sansMotif = await retourner(c, venteId, {
      lignes: [{ ligneVenteId: ligneId, quantite: 1 }],
      etat: 'CASSE',
      compensation: 'REMBOURSEMENT',
    });
    expect(sansMotif.status).toBe(400);
  });

  it('déduire de la dette : règlement AVOIR, le solde du client baisse', async () => {
    const c = await contexte();
    const { venteId, ligneId } = await vendre(c, true);
    const avant = await c.http.get(`/clients/${c.clientId}/situation`);
    expect(avant.body.solde).toBe(855000);
    const r = await retourner(c, venteId, {
      lignes: [{ ligneVenteId: ligneId, quantite: 4 }],
      etat: 'REMISE_EN_STOCK',
      compensation: 'DEDUIRE_DETTE',
    });
    expect(r.status).toBe(201);
    expect(r.body.montant).toBe(342000);
    expect(r.body.soldeClient).toBe(513000);
    expect(r.body.resteDuVente).toBe(513000);
    const apres = await c.http.get(`/clients/${c.clientId}/situation`);
    expect(apres.body.solde).toBe(513000);
    const reglement = await prisma.reglement.findUniqueOrThrow({
      where: { id: r.body.reglementId },
    });
    expect(reglement).toMatchObject({ mode: 'AVOIR', montant: 342000 });
  });

  it('déduire plus que le reste dû → 400, rien n’est écrit', async () => {
    const c = await contexte();
    const { venteId, ligneId } = await vendre(c);
    const r = await retourner(c, venteId, {
      lignes: [{ ligneVenteId: ligneId, quantite: 1 }],
      etat: 'REMISE_EN_STOCK',
      compensation: 'DEDUIRE_DETTE',
    });
    expect(r.status).toBe(400);
    expect(await stock(c)).toBe(90);
    expect(await prisma.retourClient.count({ where: { venteId } })).toBe(0);
  });

  it('retourner plus que vendu → 400, y compris en cumulant les retours', async () => {
    const c = await contexte();
    const { venteId, ligneId } = await vendre(c);
    const trop = await retourner(c, venteId, {
      lignes: [{ ligneVenteId: ligneId, quantite: 11 }],
      etat: 'REMISE_EN_STOCK',
      compensation: 'REMBOURSEMENT',
    });
    expect(trop.status).toBe(400);
    const premier = await retourner(c, venteId, {
      lignes: [{ ligneVenteId: ligneId, quantite: 7 }],
      etat: 'REMISE_EN_STOCK',
      compensation: 'REMBOURSEMENT',
    });
    expect(premier.status).toBe(201);
    const second = await retourner(c, venteId, {
      lignes: [{ ligneVenteId: ligneId, quantite: 4 }],
      etat: 'REMISE_EN_STOCK',
      compensation: 'REMBOURSEMENT',
    });
    expect(second.status).toBe(400);
    expect(await stock(c)).toBe(97);
    // Tout le reste : la somme des retours vaut exactement le total.
    const dernier = await retourner(c, venteId, {
      lignes: [{ ligneVenteId: ligneId, quantite: 3 }],
      etat: 'REMISE_EN_STOCK',
      compensation: 'REMBOURSEMENT',
    });
    expect(premier.body.montant + dernier.body.montant).toBe(855000);
    const doublon = await retourner(c, venteId, {
      lignes: [
        { ligneVenteId: ligneId, quantite: 1 },
        { ligneVenteId: ligneId, quantite: 1 },
      ],
      etat: 'REMISE_EN_STOCK',
      compensation: 'REMBOURSEMENT',
    });
    expect(doublon.status).toBe(400);
  });

  it('renvoyer au fournisseur : RETOUR_CLIENT puis retour fournisseur, avoir attendu', async () => {
    const c = await contexte();
    const { venteId, ligneId } = await vendre(c);
    const r = await retourner(c, venteId, {
      lignes: [{ ligneVenteId: ligneId, quantite: 2 }],
      etat: 'RETOUR_FOURNISSEUR',
      fournisseurId: c.fournisseurId,
      compensation: 'REMBOURSEMENT',
    });
    expect(r.status).toBe(201);
    expect(await stock(c)).toBe(90);
    const renvoi = await prisma.retourFournisseur.findUniqueOrThrow({
      where: { id: r.body.retourFournisseurId },
      include: { mouvements: true },
    });
    expect(renvoi).toMatchObject({
      statutAvoir: 'ATTENDU',
      valeurTotale: 144000,
      fournisseurId: c.fournisseurId,
    });
    expect(renvoi.mouvements[0]).toMatchObject({
      type: 'RETOUR_FOURNISSEUR',
      quantite: 2,
      retourClientId: r.body.id,
    });
  });

  it('produit suivi par lot : la marchandise revient dans le lot vendu', async () => {
    const c = await contexte();
    const riz = await c.http.post('/produits', {
      nom: 'Riz 25 kg',
      prixAchat: 285000,
      prixVente: 320000,
      suiviParLot: true,
    });
    for (const [numeroLot, datePeremption] of [
      ['A', '2027-01-01'],
      ['B', '2027-06-01'],
    ]) {
      await c.http.post('/mouvements/entree', {
        produitId: riz.body.id,
        emplacementId: c.depotId,
        quantite: 5,
        numeroLot,
        datePeremption,
      });
    }
    // FEFO : 5 du lot A puis 2 du lot B.
    const vente = await c.http.post('/ventes', {
      emplacementId: c.depotId,
      modePaiement: 'ESPECES',
      lignes: [{ produitId: riz.body.id, quantite: 7 }],
    });
    const r = await retourner(c, vente.body.id, {
      lignes: [{ ligneVenteId: vente.body.lignes[0].id, quantite: 6 }],
      etat: 'REMISE_EN_STOCK',
      compensation: 'REMBOURSEMENT',
    });
    expect(r.status).toBe(201);
    const lots = await prisma.lot.findMany({
      where: { produitId: riz.body.id },
      orderBy: { numero: 'asc' },
    });
    expect(lots.map((l) => [l.numero, l.quantite])).toEqual([
      ['A', 5],
      ['B', 4],
    ]);
  });

  it('une vente retournée ne peut plus être annulée', async () => {
    const c = await contexte();
    const { venteId, ligneId } = await vendre(c);
    await retourner(c, venteId, {
      lignes: [{ ligneVenteId: ligneId, quantite: 1 }],
      etat: 'REMISE_EN_STOCK',
      compensation: 'REMBOURSEMENT',
    });
    const annulation = await c.http.post(`/ventes/${venteId}/annuler`, {
      motif: 'Erreur de saisie',
    });
    expect(annulation.status).toBe(409);
    expect(await stock(c)).toBe(91);
    const detail = await c.http.get(`/ventes/${venteId}`);
    expect(detail.body.retours).toHaveLength(1);
    expect(detail.body.retours[0].lignes[0]).toMatchObject({
      ligneVenteId: ligneId,
      quantite: 1,
    });
  });

  it('isolation multi-entreprise sur /ventes/:id/retour', async () => {
    const a = await contexte('Entreprise A');
    const b = await contexte('Entreprise B');
    const { venteId, ligneId } = await vendre(a);
    const croise = await retourner(b, venteId, {
      lignes: [{ ligneVenteId: ligneId, quantite: 1 }],
      etat: 'REMISE_EN_STOCK',
      compensation: 'REMBOURSEMENT',
    });
    expect(croise.status).toBe(404);
    const fournisseurAutre = await retourner(a, venteId, {
      lignes: [{ ligneVenteId: ligneId, quantite: 1 }],
      etat: 'RETOUR_FOURNISSEUR',
      fournisseurId: b.fournisseurId,
      compensation: 'REMBOURSEMENT',
    });
    expect(fournisseurAutre.status).toBe(404);
    expect(await stock(a)).toBe(90);
    expect(await prisma.retourClient.count({ where: { venteId } })).toBe(0);
  });
});
