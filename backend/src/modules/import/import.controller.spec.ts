import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { MouvementsService } from '../mouvements/mouvements.service.js';
import {
  connecterClient,
  creerEntrepriseAvecAdmin,
  nettoyer,
} from '../console/console-test.utils.js';

type Ligne = Record<string, string>;

describe('Import de catalogue — intégration réelle, base PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mouvements: MouvementsService;
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
    mouvements = moduleRef.get(MouvementsService);
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await nettoyer(prisma, entrepriseIds, []);
    await app.close();
  });

  async function contexte() {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(
      prisma,
      'Quincaillerie Import',
    );
    entrepriseIds.push(entreprise.id);
    const token = (await connecterClient(app, utilisateur.email)).body
      .accessToken as string;
    const api = {
      post: (url: string, corps: object = {}) =>
        request(app.getHttpServer())
          .post(url)
          .set('Authorization', `Bearer ${token}`)
          .send(corps),
      get: (url: string) =>
        request(app.getHttpServer())
          .get(url)
          .set('Authorization', `Bearer ${token}`),
    };
    const depot = await api.post('/emplacements', { nom: 'Dépôt Madina' });
    return {
      api,
      entrepriseId: entreprise.id,
      depotId: depot.body.id as string,
    };
  }
  type Contexte = Awaited<ReturnType<typeof contexte>>;

  /** Ouvre une session et envoie les lignes par lots de 200 (en-tête = ligne 1). */
  async function envoyer(c: Contexte, lignes: Ligne[]) {
    const session = await c.api.post('/produits/import/session', {
      nomFichier: 'catalogue.csv',
    });
    expect(session.status).toBe(201);
    const id = session.body.id as string;
    for (let i = 0; i < lignes.length; i += 200) {
      const lot = lignes
        .slice(i, i + 200)
        .map((valeurs, j) => ({ numero: i + j + 2, valeurs }));
      const r = await c.api.post(`/produits/import/session/${id}/lignes`, {
        lignes: lot,
      });
      expect(r.status).toBe(200);
    }
    return id;
  }

  const verifier = (c: Contexte, id: string, options: object = {}) =>
    c.api.post(`/produits/import/session/${id}/verifier`, {
      emplacementId: c.depotId,
      ...options,
    });
  const executer = (c: Contexte, id: string, options: object = {}) =>
    c.api.post(`/produits/import/session/${id}/executer`, {
      emplacementId: c.depotId,
      ...options,
    });

  const messagesDe = (
    rapport: {
      problemes: { numero: number; problemes: { message: string }[] }[];
    },
    numero: number,
  ) =>
    rapport.problemes
      .find((p) => p.numero === numero)
      ?.problemes.map((p) => p.message) ?? [];

  it('bloque une ligne sans nom, laisse passer les autres, et n’écrit rien avant l’exécution', async () => {
    const c = await contexte();
    const id = await envoyer(c, [
      {
        nom: 'Ciment Portland 50 kg',
        prixAchat: '82 000',
        prixVente: '95 000',
      },
      { nom: '', reference: 'X-1', prixVente: '1000' },
      { nom: 'Tôle ondulée 3 m', prixVente: '72 000' },
      {},
    ]);
    const rapport = await verifier(c, id);
    expect(rapport.status).toBe(200);
    expect(rapport.body.compteurs).toEqual({
      aCreer: 2,
      aMettreAJour: 0,
      aCorriger: 0,
      bloquees: 1,
    });
    expect(messagesDe(rapport.body, 3)).toEqual([
      'Le nom est la seule colonne obligatoire — cette ligne sera ignorée',
    ]);
    expect(
      await prisma.produit.count({ where: { entrepriseId: c.entrepriseId } }),
    ).toBe(0);

    expect((await executer(c, id)).status).toBe(409);
    const resultat = await executer(c, id, { ignorerBloquees: true });
    expect(resultat.status).toBe(200);
    expect(resultat.body).toMatchObject({
      lignesCreees: 2,
      lignesMisesAJour: 0,
      lignesIgnorees: 1,
    });
    const produits = await prisma.produit.findMany({
      where: { entrepriseId: c.entrepriseId },
      orderBy: { nom: 'asc' },
    });
    expect(
      produits.map((p) => [p.nom, p.prixAchat, p.prixVente, p.importId]),
    ).toEqual([
      ['Ciment Portland 50 kg', 82000, 95000, id],
      ['Tôle ondulée 3 m', null, 72000, id],
    ]);
    expect((await executer(c, id, { ignorerBloquees: true })).status).toBe(409);
  });

  it('formule des erreurs actionnables : vente à perte, date illisible, date ambiguë', async () => {
    const c = await contexte();
    const id = await envoyer(c, [
      { nom: 'Groupe électrogène', prixAchat: '420 000', prixVente: '380 000' },
      { nom: 'Lait en poudre', quantite: '10', datePeremption: '32/13/2026' },
      { nom: 'Biscuits', quantite: '5', datePeremption: '03/04/2027' },
      { nom: 'Clous', prixVente: 'sur devis' },
    ]);
    const rapport = (await verifier(c, id)).body;
    expect(messagesDe(rapport, 2)).toEqual([
      'Achat 420 000 · Détail 380 000 — vous vendriez à perte',
    ]);
    expect(messagesDe(rapport, 3)).toEqual([
      'Valeur trouvée : 32/13/2026 — attendu jj/mm/aaaa',
    ]);
    expect(messagesDe(rapport, 4)).toEqual([
      '03/04/2027 lue comme le 3 avril 2027 (format français) — vérifiez',
    ]);
    expect(messagesDe(rapport, 5)).toEqual([
      'Prix de vente : valeur trouvée « sur devis » — attendu un nombre',
    ]);
    expect(rapport.compteurs).toEqual({
      aCreer: 2,
      aMettreAJour: 0,
      aCorriger: 2,
      bloquees: 2,
    });
  });

  it('signale un doublon de référence dans le fichier et conserve la ligne choisie', async () => {
    const c = await contexte();
    const id = await envoyer(c, [
      { nom: 'Vis à bois 4x40', reference: 'MAT-0088', prixVente: '500' },
      { nom: 'Ciment', reference: 'MAT-0001' },
      {
        nom: 'Vis à bois 4x40 (boîte)',
        reference: 'mat-0088',
        prixVente: '4500',
      },
    ]);
    const rapport = (await verifier(c, id)).body;
    expect(messagesDe(rapport, 4)).toEqual([
      'MAT-0088 apparaît aussi ligne 2 — une seule sera conservée',
    ]);
    expect(messagesDe(rapport, 2)).toEqual([
      'MAT-0088 apparaît aussi ligne 4 — c’est cette ligne qui sera conservée',
    ]);
    expect(rapport.compteurs.bloquees).toBe(1);

    const autreChoix = (await verifier(c, id, { conserver: [4] })).body;
    expect(messagesDe(autreChoix, 2)).toEqual([
      'mat-0088 apparaît aussi ligne 4 — une seule sera conservée',
    ]);
    await executer(c, id, { conserver: [4], ignorerBloquees: true });
    const vis = await prisma.produit.findMany({
      where: { entrepriseId: c.entrepriseId, nom: { startsWith: 'Vis' } },
    });
    expect(vis.map((p) => [p.nom, p.prixVente])).toEqual([
      ['Vis à bois 4x40 (boîte)', 4500],
    ]);
  });

  it('met à jour un produit existant (référence, puis code-barre) au lieu de le recréer', async () => {
    const c = await contexte();
    const parRef = await c.api.post('/produits', {
      nom: 'Ciment ancien nom',
      reference: 'MAT-0001',
      prixVente: 90000,
    });
    const parCode = await c.api.post('/produits', {
      nom: 'Peinture',
      codeBarre: '6111245000123',
      prixVente: 190000,
    });
    await c.api.post('/mouvements/entree', {
      produitId: parRef.body.id,
      emplacementId: c.depotId,
      quantite: 40,
    });

    const id = await envoyer(c, [
      {
        nom: 'Ciment Portland 50 kg',
        reference: 'mat-0001',
        prixVente: '95 000',
        quantite: '100',
      },
      {
        nom: 'Peinture blanche 20 L',
        codeBarre: '6111245000123',
        prixAchat: '165 000',
      },
    ]);
    const rapport = (await verifier(c, id)).body;
    expect(rapport.compteurs).toMatchObject({ aCreer: 0, aMettreAJour: 2 });
    expect(messagesDe(rapport, 2)).toEqual([
      'Produit existant « Ciment ancien nom » : la quantité 100 ne sera pas ajoutée — passez par une entrée de stock',
    ]);

    const resultat = (await executer(c, id)).body;
    expect(resultat).toMatchObject({
      lignesCreees: 0,
      lignesMisesAJour: 2,
      mouvementsCrees: 0,
    });
    expect(
      await prisma.produit.count({ where: { entrepriseId: c.entrepriseId } }),
    ).toBe(2);
    const ciment = await prisma.produit.findUniqueOrThrow({
      where: { id: parRef.body.id },
    });
    expect([ciment.nom, ciment.prixVente, ciment.importId]).toEqual([
      'Ciment Portland 50 kg',
      95000,
      null,
    ]);
    const peinture = await prisma.produit.findUniqueOrThrow({
      where: { id: parCode.body.id },
    });
    expect([peinture.nom, peinture.prixAchat, peinture.prixVente]).toEqual([
      'Peinture blanche 20 L',
      165000,
      190000,
    ]);
    const stock = await prisma.stock.findFirstOrThrow({
      where: { produitId: parRef.body.id },
    });
    expect(stock.quantite).toBe(40);
  });

  it('crée une catégorie inconnue, rattache « Materiaux » à « Matériaux » et respecte une association choisie', async () => {
    const c = await contexte();
    const materiaux = await c.api.post('/categories', { nom: 'Matériaux' });
    const quincaillerie = await c.api.post('/categories', {
      nom: 'Quincaillerie',
    });
    const id = await envoyer(c, [
      { nom: 'Ciment', categorie: 'MATERIAUX' },
      {
        nom: 'Riz parfumé 25 kg',
        categorie: 'Alimentation',
        marque: 'Royal Umbrella',
      },
      { nom: 'Vis', categorie: 'Visserie' },
      { nom: 'Huile 5 L', categorie: 'alimentation' },
    ]);
    const rapport = (await verifier(c, id)).body;
    expect(rapport.categoriesInconnues).toEqual([
      { nom: 'Alimentation', lignes: 2 },
      { nom: 'Visserie', lignes: 1 },
    ]);
    expect(messagesDe(rapport, 4)).toEqual([
      'Catégorie « Visserie » inconnue — elle sera créée automatiquement, ou associez-la à une existante',
    ]);
    // Annoncée une seule fois : la 2e ligne « alimentation » n'est pas répétée.
    expect(messagesDe(rapport, 5)).toEqual([]);

    const options = { categories: { Visserie: quincaillerie.body.id } };
    expect((await verifier(c, id, options)).body.categoriesInconnues).toEqual([
      { nom: 'Alimentation', lignes: 2 },
    ]);
    const resultat = (await executer(c, id, options)).body;
    expect(resultat.categoriesCreees).toEqual(['Alimentation']);
    expect(resultat.marquesCreees).toEqual(['Royal Umbrella']);

    const produits = await prisma.produit.findMany({
      where: { entrepriseId: c.entrepriseId },
      include: { categorie: true },
      orderBy: { nom: 'asc' },
    });
    expect(produits.map((p) => [p.nom, p.categorie?.nom])).toEqual([
      ['Ciment', 'Matériaux'],
      ['Huile 5 L', 'Alimentation'],
      ['Riz parfumé 25 kg', 'Alimentation'],
      ['Vis', 'Quincaillerie'],
    ]);
    expect(produits[0].categorieId).toBe(materiaux.body.id);
    expect(
      await prisma.categorie.count({ where: { entrepriseId: c.entrepriseId } }),
    ).toBe(3);
  });

  it('crée les quantités initiales par des entrées de stock tracées, en lot daté si une péremption est donnée', async () => {
    const c = await contexte();
    const id = await envoyer(c, [
      { nom: 'Ciment', quantite: '400' },
      {
        nom: 'Riz parfumé 25 kg',
        quantite: '60',
        numeroLot: 'LOT-2601-C',
        datePeremption: '04/01/2027',
      },
      { nom: 'Tôle', quantite: '' },
    ]);
    const sansEmplacement = await c.api.post(
      `/produits/import/session/${id}/verifier`,
      {},
    );
    expect(sansEmplacement.body.erreursGlobales).toEqual([
      'Choisissez l’emplacement qui reçoit les quantités initiales.',
    ]);

    const resultat = (await executer(c, id)).body;
    expect(resultat).toMatchObject({
      lignesCreees: 3,
      mouvementsCrees: 2,
      suiviParLot: 1,
    });
    const entrees = await prisma.mouvement.findMany({
      where: { entrepriseId: c.entrepriseId },
      include: { produit: true, lot: true },
      orderBy: { quantite: 'desc' },
    });
    expect(
      entrees.map((m) => [
        m.type,
        m.produit.nom,
        m.quantite,
        m.lot?.numero ?? null,
      ]),
    ).toEqual([
      ['ENTREE', 'Ciment', 400, null],
      ['ENTREE', 'Riz parfumé 25 kg', 60, 'LOT-2601-C'],
    ]);
    expect(entrees[1].produit.suiviParLot).toBe(true);
    expect(entrees[1].lot?.datePeremption?.toISOString().slice(0, 10)).toBe(
      '2027-01-04',
    );
    const journal = await prisma.importLigne.findMany({
      where: { importId: id },
      orderBy: { numero: 'asc' },
    });
    expect(journal.map((l) => l.mouvementId !== null)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('est transactionnel : une erreur en cours d’écriture n’écrit rien', async () => {
    const c = await contexte();
    const id = await envoyer(
      c,
      [1, 2, 3, 4].map((n) => ({
        nom: `Article ${n}`,
        categorie: 'Nouvelle catégorie',
        quantite: '5',
      })),
    );
    const original = mouvements.entreeDansTransaction.bind(mouvements);
    let appels = 0;
    vi.spyOn(mouvements, 'entreeDansTransaction').mockImplementation(
      async (...args) => {
        if (++appels === 3) throw new Error('Panne simulée au 3e produit');
        return original(...args);
      },
    );

    expect((await executer(c, id)).status).toBe(500);
    expect(
      await prisma.produit.count({ where: { entrepriseId: c.entrepriseId } }),
    ).toBe(0);
    expect(
      await prisma.categorie.count({ where: { entrepriseId: c.entrepriseId } }),
    ).toBe(0);
    expect(
      await prisma.mouvement.count({ where: { entrepriseId: c.entrepriseId } }),
    ).toBe(0);
    expect(
      await prisma.stock.count({ where: { emplacementId: c.depotId } }),
    ).toBe(0);
    expect(
      (await prisma.importCatalogue.findUniqueOrThrow({ where: { id } }))
        .statut,
    ).not.toBe('EXECUTE');

    vi.restoreAllMocks();
    expect((await executer(c, id)).body.lignesCreees).toBe(4);
  });

  it('annuler archive les produits créés et retire leur stock initial ; les mises à jour restent', async () => {
    const c = await contexte();
    const existant = await c.api.post('/produits', {
      nom: 'Ciment',
      reference: 'MAT-0001',
    });
    const id = await envoyer(c, [
      { nom: 'Ciment Portland', reference: 'MAT-0001' },
      { nom: 'Fer à béton', quantite: '300' },
      { nom: 'Riz', quantite: '20', datePeremption: '2027-06-30' },
    ]);
    await executer(c, id);

    const annulation = await c.api.post(`/produits/import/${id}/annuler`);
    expect(annulation.status).toBe(200);
    expect(annulation.body).toEqual({ produitsArchives: 2 });
    const produits = await prisma.produit.findMany({ where: { importId: id } });
    expect(produits.every((p) => p.archive)).toBe(true);
    expect(await prisma.produit.count({ where: { importId: id } })).toBe(2);
    const stocks = await prisma.stock.findMany({
      where: { produitId: { in: produits.map((p) => p.id) } },
    });
    expect(stocks.every((s) => s.quantite === 0)).toBe(true);
    const ajustements = await prisma.mouvement.findMany({
      where: {
        produitId: { in: produits.map((p) => p.id) },
        type: 'AJUSTEMENT',
      },
    });
    expect(ajustements.map((m) => m.quantite).sort()).toEqual([-20, -300]);
    expect(
      (
        await prisma.lot.findFirstOrThrow({
          where: { produitId: { in: produits.map((p) => p.id) } },
        })
      ).quantite,
    ).toBe(0);
    const ciment = await prisma.produit.findUniqueOrThrow({
      where: { id: existant.body.id },
    });
    expect([ciment.nom, ciment.archive]).toEqual(['Ciment Portland', false]);
    expect(
      (await prisma.importCatalogue.findUniqueOrThrow({ where: { id } }))
        .statut,
    ).toBe('ANNULE');
    expect((await c.api.post(`/produits/import/${id}/annuler`)).status).toBe(
      409,
    );
  });

  it('refuse l’annulation si un produit importé a connu un mouvement depuis', async () => {
    const c = await contexte();
    const id = await envoyer(c, [
      { nom: 'Ciment', quantite: '100' },
      { nom: 'Tôle' },
    ]);
    await executer(c, id);
    const ciment = await prisma.produit.findFirstOrThrow({
      where: { importId: id, nom: 'Ciment' },
    });
    await c.api.post('/mouvements/sortie', {
      produitId: ciment.id,
      emplacementId: c.depotId,
      quantite: 3,
    });

    const annulation = await c.api.post(`/produits/import/${id}/annuler`);
    expect(annulation.status).toBe(409);
    expect(annulation.body.message).toContain('« Ciment » a déjà servi');
    expect(
      await prisma.produit.count({ where: { importId: id, archive: true } }),
    ).toBe(0);
  });

  it('isole les entreprises : session d’une autre entreprise introuvable, rapprochement limité à la sienne', async () => {
    const a = await contexte();
    const b = await contexte();
    await a.api.post('/produits', {
      nom: 'Produit de A',
      reference: 'MAT-0001',
    });
    const idA = await envoyer(a, [{ nom: 'Ciment' }]);

    expect(
      (
        await b.api.post(`/produits/import/session/${idA}/lignes`, {
          lignes: [{ numero: 9, valeurs: { nom: 'Intrus' } }],
        })
      ).status,
    ).toBe(404);
    expect((await verifier(b, idA)).status).toBe(404);
    expect((await executer(b, idA)).status).toBe(404);
    expect((await b.api.post(`/produits/import/${idA}/annuler`)).status).toBe(
      404,
    );

    const idB = await envoyer(b, [
      { nom: 'Produit de B', reference: 'MAT-0001' },
    ]);
    expect((await verifier(b, idB)).body.compteurs).toMatchObject({
      aCreer: 1,
      aMettreAJour: 0,
    });
    await executer(b, idB);
    expect(
      await prisma.produit.count({ where: { entrepriseId: b.entrepriseId } }),
    ).toBe(1);
    expect(
      (
        await prisma.produit.findFirstOrThrow({
          where: { entrepriseId: a.entrepriseId },
        })
      ).nom,
    ).toBe('Produit de A');
    expect(await prisma.importLigne.count({ where: { importId: idA } })).toBe(
      1,
    );
  });

  it('refuse plus de 200 lignes par envoi et respecte la limite de références de la formule', async () => {
    const c = await contexte();
    const session = await c.api.post('/produits/import/session', {
      nomFichier: 'gros.csv',
    });
    const trop = Array.from({ length: 201 }, (_, i) => ({
      numero: i + 2,
      valeurs: { nom: `P${i}` },
    }));
    expect(
      (
        await c.api.post(`/produits/import/session/${session.body.id}/lignes`, {
          lignes: trop,
        })
      ).status,
    ).toBe(400);

    await prisma.entreprise.update({
      where: { id: c.entrepriseId },
      data: { limiteReferences: 2 },
    });
    const id = await envoyer(c, [{ nom: 'A' }, { nom: 'B' }, { nom: 'C' }]);
    const rapport = (await verifier(c, id)).body;
    expect(rapport.erreursGlobales).toEqual([
      'Votre formule autorise 2 références : l’import en créerait 3, il en reste 2 disponibles.',
    ]);
    expect((await executer(c, id)).status).toBe(400);
  });

  it('fournit les modèles CSV (vierge, exemples, catalogue existant sans quantités)', async () => {
    const c = await contexte();
    await c.api.post('/produits', {
      nom: 'Ciment',
      reference: 'MAT-0001',
      prixVente: 95000,
    });
    const vierge = await c.api.get('/produits/import/modele?type=vierge');
    expect(vierge.headers['content-type']).toContain('text/csv');
    expect(vierge.text.replace('﻿', '').split('\r\n')[0]).toBe(
      'Nom du produit;Référence;Code-barre;Catégorie;Marque;Unité;Prix d’achat;Prix de vente;Prix demi-gros;Prix gros;TVA (%);Seuil d’alerte;Quantité initiale;Numéro de lot;Date de péremption;Description',
    );
    const exemples = await c.api.get('/produits/import/modele?type=exemples');
    expect(exemples.text.trim().split('\r\n')).toHaveLength(6);
    const existant = await c.api.get('/produits/import/modele?type=existant');
    expect(existant.text.split('\r\n')[1]).toBe(
      'Ciment;MAT-0001;;;;;;95000;;;;0;;;;',
    );
    expect((await c.api.get('/produits/import/modele?type=autre')).status).toBe(
      400,
    );
  });

  it('importe 400 lignes avec quantités initiales en une transaction (durée mesurée)', async () => {
    const c = await contexte();
    const lignes = Array.from({ length: 400 }, (_, i) => ({
      nom: `Article ${i + 1}`,
      reference: `REF-${String(i + 1).padStart(4, '0')}`,
      categorie: ['Matériaux', 'Plomberie', 'Électricité', 'Peinture'][i % 4],
      prixAchat: '10 000',
      prixVente: '12 500',
      quantite: String(10 + (i % 50)),
    }));
    const id = await envoyer(c, lignes);
    const resultat = (await executer(c, id)).body;
    process.stderr.write(
      `Import de 400 lignes avec mouvements : ${resultat.dureeMs} ms\n`,
    );
    expect(resultat).toMatchObject({ lignesCreees: 400, mouvementsCrees: 400 });
    expect(
      await prisma.mouvement.count({
        where: { entrepriseId: c.entrepriseId, type: 'ENTREE' },
      }),
    ).toBe(400);
    expect(resultat.dureeMs).toBeLessThan(30_000);
  }, 60_000);

  it('prévient quand un produit du même nom existe sans référence commune', async () => {
    const c = await contexte();
    await c.api.post('/produits', { nom: 'Ciment Portland 50 kg' });
    const id = await envoyer(c, [
      { nom: 'CIMENT portland 50 kg', reference: 'MAT-0001' },
    ]);
    const rapport = (await verifier(c, id)).body;
    expect(rapport.compteurs).toMatchObject({ aCreer: 1, aCorriger: 1 });
    expect(messagesDe(rapport, 2)).toEqual([
      '« Ciment Portland 50 kg » existe déjà au catalogue sans référence ni code-barre commun — un second produit sera créé',
    ]);
  });
});
