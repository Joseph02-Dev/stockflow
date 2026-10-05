import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';
import { enTexte, lirePdf } from './rapports-test.utils.js';

/** Réponse binaire (PDF) récupérée en Buffer. */
const binaire = (res: request.Response, rappel: (err: Error | null, body: Buffer) => void) => {
  const morceaux: Buffer[] = [];
  res.on('data', (m: Buffer) => morceaux.push(m));
  res.on('end', () => rappel(null, Buffer.concat(morceaux)));
};

describe('Rapports PDF — intégration réelle, base PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const entrepriseIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await nettoyer(prisma, entrepriseIds, []);
    await app.close();
  });

  async function contexte(nom = 'Ets Camara & Frères') {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, nom);
    entrepriseIds.push(entreprise.id);
    const token = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    const get = (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`);
    const pdf = (url: string) => get(url).buffer(true).parse(binaire);
    const post = (url: string, corps: object) =>
      request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(corps);
    const patch = (url: string, corps: object) =>
      request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${token}`).send(corps);
    return { entreprise, get, pdf, post, patch };
  }

  /** Catalogue en masse (insertion directe) : n références réparties sur deux dépôts. */
  async function catalogue(entrepriseId: string, n: number) {
    const [madina, matoto] = await Promise.all(
      ['Dépôt Madina', 'Réserve Matoto'].map((nom) => prisma.emplacement.create({ data: { entrepriseId, nom } })),
    );
    const categories = await Promise.all(
      ['Ciments', 'Fers à béton', 'Peintures', 'Quincaillerie'].map((nom) => prisma.categorie.create({ data: { entrepriseId, nom } })),
    );
    const produits = Array.from({ length: n }, (_, i) => ({
      id: crypto.randomUUID(),
      entrepriseId,
      nom: `Article ${String(i + 1).padStart(3, '0')} périmé Frères`,
      reference: `REF-${i + 1}`,
      prixAchat: 1000 + i * 137,
      prixVente: 1300 + i * 150,
      seuilAlerte: 5,
      categorieId: i % 5 === 4 ? null : categories[i % 4].id,
    }));
    await prisma.produit.createMany({ data: produits });
    await prisma.stock.createMany({
      data: produits.flatMap((p, i) => [
        { produitId: p.id, emplacementId: madina.id, quantite: (i * 7) % 40 },
        ...(i % 3 === 0 ? [{ produitId: p.id, emplacementId: matoto.id, quantite: (i % 11) + 1 }] : []),
      ]),
    });
    return { madina, matoto, categories };
  }

  it('entreprise sans coordonnées ni logo : PDF valide, en-tête HTTP application/pdf, document propre', async () => {
    const c = await contexte('Quincaillerie Sans Coordonnées');
    const r = await c.pdf('/rapports/stock');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="etat-du-stock-\d{4}-\d{2}-\d{2}\.pdf"$/);
    expect(r.headers['cache-control']).toBe('no-store');
    const corps = r.body as Buffer;
    expect(corps.length).toBeGreaterThan(1000);
    expect(corps.subarray(0, 5).toString()).toBe('%PDF-');
    expect(corps.subarray(-6).toString()).toContain('%%EOF');
    const { pages } = await lirePdf(corps);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain('Quincaillerie Sans Coordonnées');
    expect(pages[0]).toContain('État du stock');
    expect(pages[0]).toContain('page 1 sur 1');
    expect(pages[0]).not.toMatch(/RCCM|NIF|null|undefined/);
  });

  it('coordonnées renseignées : en-tête complet', async () => {
    const c = await contexte();
    await prisma.entreprise.update({
      where: { id: c.entreprise.id },
      data: { adresse: 'Marché Madina, Conakry', telephone: '+224 622 45 18 03', rccm: 'GN.TCC.2021.B.04512', nif: '7845120' },
    });
    const { pages } = await lirePdf((await c.pdf('/rapports/stock')).body as Buffer);
    expect(pages[0]).toContain('Marché Madina, Conakry');
    expect(pages[0]).toContain('RCCM GN.TCC.2021.B.04512 · NIF 7845120');
    expect(pages[0]).toContain('Ets Camara & Frères');
  });

  it('état du stock de 428 références : plusieurs pages, en-tête de tableau sur chaque page, totaux égaux à la base', async () => {
    const c = await contexte();
    await catalogue(c.entreprise.id, 428);
    const debut = Date.now();
    const r = await c.pdf('/rapports/stock?detail=true&graphiques=true&signature=true');
    const duree = Date.now() - debut;
    expect(r.status).toBe(200);
    const { pages } = await lirePdf(r.body as Buffer);
    expect(pages.length).toBeGreaterThan(5);
    expect(r.headers['x-nombre-pages']).toBe(String(pages.length));
    pages.forEach((texte, i) => {
      // Toute page qui porte des lignes du tableau en répète l'en-tête.
      if (/REF-\d+/.test(texte)) {
        expect(texte, `page ${i + 1}`).toContain('Désignation Référence Emplacement Qté Prix d’achat Valeur');
      }
      expect(texte, `page ${i + 1}`).toContain(`page ${i + 1} sur ${pages.length}`);
    });
    expect(pages.filter((t) => /REF-\d+/.test(t)).length).toBeGreaterThanOrEqual(pages.length - 1);
    expect(pages.join(' ')).toContain('Dépôt Madina');
    expect(pages.join(' ')).toContain('Réserve Matoto');

    const [{ valeur, quantite }] = await prisma.$queryRaw<{ valeur: bigint; quantite: bigint }[]>`
      SELECT SUM(s.quantite * p.prix_achat)::bigint AS valeur, SUM(s.quantite)::bigint AS quantite
      FROM stock s JOIN produit p ON p.id = s.produit_id
      WHERE p.entreprise_id = ${c.entreprise.id} AND NOT p.archive`;
    const tout = pages.join(' ');
    expect(tout).toContain(`Total général ${enTexte(Number(quantite))} ${enTexte(Number(valeur))}`);
    expect(pages[0]).toContain(`${enTexte(Number(valeur))} GNF`);
    expect(pages[0]).toContain('428');
    console.info(`État du stock, 428 références : ${pages.length} pages en ${duree} ms`);
  });

  it('filtres et CSV : un emplacement, montants bruts, séparateur « ; »', async () => {
    const c = await contexte();
    const { matoto } = await catalogue(c.entreprise.id, 30);
    const csv = await c.get(`/rapports/stock?format=csv&emplacementId=${matoto.id}`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lignes = csv.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lignes[0]).toBe('Catégorie;Désignation;Fournisseur;Référence;Emplacement;Quantité;Prix d’achat;Valeur;Péremption;État');
    expect(lignes).toHaveLength(31);
    expect(lignes.slice(1).every((l) => l.includes(';Réserve Matoto;'))).toBe(true);
    const [{ valeur }] = await prisma.$queryRaw<{ valeur: bigint }[]>`
      SELECT COALESCE(SUM(s.quantite * p.prix_achat), 0)::bigint AS valeur FROM stock s JOIN produit p ON p.id = s.produit_id
      WHERE s.emplacement_id = ${matoto.id}`;
    expect(lignes.slice(1).reduce((a, l) => a + Number(l.split(';')[7]), 0)).toBe(Number(valeur));
  });

  it('isolation multi-entreprise : emplacement ou catégorie d’une autre entreprise → 404, jamais le document', async () => {
    const a = await contexte('Entreprise A');
    const b = await contexte('Entreprise B');
    const { madina, categories } = await catalogue(a.entreprise.id, 5);
    for (const url of [`/rapports/stock?emplacementId=${madina.id}`, `/rapports/stock?categorieId=${categories[0].id}`]) {
      const r = await b.pdf(url);
      expect(r.status).toBe(404);
      expect(r.headers['content-type']).not.toContain('application/pdf');
    }
    const { pages } = await lirePdf((await b.pdf('/rapports/stock')).body as Buffer);
    expect(pages.join(' ')).not.toContain('Article 001');
  });

  /** Scénario réel par l'API : entrée, sortie, transfert, vente, casse annulée. */
  async function activite(c: Awaited<ReturnType<typeof contexte>>) {
    const produit = (await c.post('/produits', { nom: 'Ciment Portland 50 kg', prixAchat: 82000, prixVente: 95000 })).body;
    const madina = (await c.post('/emplacements', { nom: 'Dépôt Madina' })).body;
    const matoto = (await c.post('/emplacements', { nom: 'Réserve Matoto' })).body;
    await c.post('/mouvements/entree', { produitId: produit.id, emplacementId: madina.id, quantite: 100 });
    await c.post('/mouvements/sortie', { produitId: produit.id, emplacementId: madina.id, quantite: 30 });
    await c.post('/mouvements/transfert', { produitId: produit.id, emplacementSourceId: madina.id, emplacementDestinationId: matoto.id, quantite: 20 });
    const vente = (await c.post('/ventes', { emplacementId: matoto.id, modePaiement: 'ESPECES', lignes: [{ produitId: produit.id, quantite: 4 }] })).body;
    const [casse] = (await c.post('/pertes', { produitId: produit.id, emplacementId: madina.id, quantite: 5, motif: 'VOL' })).body;
    await c.post(`/pertes/${casse.id}/annuler`, { motif: 'Sacs retrouvés' });
    return { produit, madina, matoto, vente };
  }

  it('journal : solde après chaque opération recalculable à la main, transfert sur deux lignes', async () => {
    const c = await contexte();
    const { madina, matoto, vente } = await activite(c);
    const csv = await c.get('/rapports/mouvements?format=csv');
    expect(csv.status).toBe(200);
    const lignes = csv.text.replace(/^\uFEFF/, '').trim().split('\r\n').slice(1).map((l) => l.split(';'));
    // Colonnes : 5 type, 6 quantité, 7 solde après, 8 emplacement, 10 pièce.
    expect(lignes.map((l) => [l[5], l[6], l[7], l[8]])).toEqual([
      ['Entrée', '100', '100', 'Dépôt Madina'],
      ['Sortie', '-30', '70', 'Dépôt Madina'],
      ['Transfert vers Réserve Matoto', '-20', '50', 'Dépôt Madina'],
      ['Transfert depuis Dépôt Madina', '20', '20', 'Réserve Matoto'],
      ['Sortie', '-4', '16', 'Réserve Matoto'],
      ['Casse', '-5', '45', 'Dépôt Madina'],
      ['Ajustement', '5', '50', 'Dépôt Madina'],
    ]);
    expect(lignes[4][10]).toBe(vente.numero);
    expect(lignes[5][11]).toBe('oui');
    expect(lignes[6][10]).toBe('Annulation casse');
    // Le dernier solde de chaque emplacement est le stock réel.
    const stocks = await prisma.stock.findMany({ where: { emplacementId: { in: [madina.id, matoto.id] } } });
    expect(stocks.find((s) => s.emplacementId === madina.id)?.quantite).toBe(50);
    expect(stocks.find((s) => s.emplacementId === matoto.id)?.quantite).toBe(16);

    const r = await c.pdf('/rapports/mouvements');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    const texte = (await lirePdf(r.body as Buffer)).pages.join(' ');
    expect(texte).toContain('Journal des mouvements');
    expect(texte).toContain('Date et heure Produit Type Qté Solde après Emplacement Auteur Pièce');
    expect(texte).toContain('annulée ensuite');
    expect(texte).toContain('Mouvements 7');
  });

  it('journal : filtres d’emplacement, de type et de période', async () => {
    const c = await contexte();
    const { matoto } = await activite(c);
    const parEmplacement = await c.get(`/rapports/mouvements?format=csv&emplacementId=${matoto.id}`);
    expect(parEmplacement.text.trim().split('\r\n')).toHaveLength(3);
    const casses = await c.get('/rapports/mouvements?format=csv&type=CASSE');
    expect(casses.text.trim().split('\r\n')).toHaveLength(2);
    // Un mouvement antidaté sort de la période, mais compte toujours dans les soldes.
    await prisma.mouvement.updateMany({ where: { entrepriseId: c.entreprise.id, type: 'ENTREE' }, data: { createdAt: new Date('2025-01-15T10:00:00Z') } });
    const recent = await c.get('/rapports/mouvements?format=csv');
    const lignes = recent.text.trim().split('\r\n').slice(1).map((l) => l.split(';'));
    expect(lignes[0].slice(5, 8)).toEqual(['Sortie', '-30', '70']);
    const ancien = await c.get('/rapports/mouvements?format=csv&debut=2025-01-01&fin=2025-01-31');
    expect(ancien.text.trim().split('\r\n')).toHaveLength(2);
    expect((await c.get('/rapports/mouvements?debut=2026-02-01&fin=2026-01-01')).status).toBe(400);
  });

  it('journal : isolation multi-entreprise', async () => {
    const a = await contexte('Entreprise A');
    const b = await contexte('Entreprise B');
    const { madina } = await activite(a);
    expect((await b.pdf(`/rapports/mouvements?emplacementId=${madina.id}`)).status).toBe(404);
    const csv = await b.get('/rapports/mouvements?format=csv');
    expect(csv.text.replace(/^\uFEFF/, '').trim().split('\r\n')).toHaveLength(1);
  });

  /** Compte client : vente antérieure, ventes de la période, règlements partiels, avoir, vente annulée. */
  async function compteClient(c: Awaited<ReturnType<typeof contexte>>) {
    const produit = (await c.post('/produits', { nom: 'Fer à béton 12 mm', prixAchat: 60000, prixVente: 75000 })).body;
    const depot = (await c.post('/emplacements', { nom: 'Dépôt Madina' })).body;
    await c.post('/mouvements/entree', { produitId: produit.id, emplacementId: depot.id, quantite: 500 });
    const client = (await c.post('/clients', { nom: 'Mamadou Bah', telephone: '+224 622 45 18 03', plafondCredit: 10000000 })).body;
    const vendre = async (quantite: number) =>
      (await c.post('/ventes', { clientId: client.id, emplacementId: depot.id, modePaiement: 'CREDIT', lignes: [{ produitId: produit.id, quantite }] })).body;

    const ancienne = await vendre(40); // 3 000 000
    await c.post(`/ventes/${ancienne.id}/reglements`, { montant: 550000, mode: 'ESPECES' });
    await prisma.vente.update({ where: { id: ancienne.id }, data: { createdAt: new Date('2025-12-10T09:00:00Z') } });
    await prisma.reglement.updateMany({ where: { venteId: ancienne.id }, data: { createdAt: new Date('2025-12-20T09:00:00Z') } });

    const v1 = await vendre(20); // 1 500 000
    await c.post(`/ventes/${v1.id}/reglements`, { montant: 400000, mode: 'ORANGE_MONEY' });
    const v2 = await vendre(10); // 750 000
    const retour = await c.post(`/ventes/${v2.id}/retour`, {
      lignes: [{ ligneVenteId: v2.lignes[0].id, quantite: 2 }],
      etat: 'REMISE_EN_STOCK',
      compensation: 'DEDUIRE_DETTE',
    });
    expect(retour.status).toBe(201);
    const annulee = await vendre(4);
    await c.post(`/ventes/${annulee.id}/reglements`, { montant: 100000, mode: 'MTN_MOMO' });
    await c.post(`/ventes/${annulee.id}/annuler`, { motif: 'Erreur de client' });
    return { client, ancienne, v1, v2, annulee };
  }

  it('relevé client : solde ligne à ligne, report antérieur, règlements partiels et avoir, solde final = solde dû réel', async () => {
    const c = await contexte();
    const { client, v1, v2, annulee } = await compteClient(c);
    const reel = (await c.get(`/clients/${client.id}/situation`)).body.solde as number;
    expect(reel).toBe(3000000 - 550000 + 1500000 - 400000 + 750000 - 150000);

    const csv = await c.get(`/rapports/client/${client.id}?format=csv&debut=2026-01-01`);
    expect(csv.status).toBe(200);
    const lignes = csv.text.replace(/^\uFEFF/, '').trim().split('\r\n').slice(1).map((l) => l.split(';'));
    expect(lignes[0]).toEqual(['01/01/2026', '', 'Report du solde antérieur', '', '', '2450000']);
    let solde = 2450000;
    for (const [, , , debit, credit, s] of lignes.slice(1)) {
      solde += Number(debit || 0) - Number(credit || 0);
      expect(Number(s)).toBe(solde);
    }
    expect(solde).toBe(reel);
    const libelles = lignes.slice(1).map((l) => `${l[1]} ${l[2]}`);
    expect(libelles).toEqual([
      `${v1.numero} Vente — 20 articles`,
      `${v1.numero} Règlement Orange Money`,
      `${v2.numero} Vente — 10 articles`,
      `${v2.numero} Avoir sur retour de marchandise`,
    ]);
    expect(csv.text).not.toContain(annulee.numero);

    const r = await c.pdf(`/rapports/client/${client.id}?debut=2026-01-01`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toMatch(/filename="releve-mamadou-bah-\d{4}-\d{2}-\d{2}\.pdf"/);
    const texte = (await lirePdf(r.body as Buffer)).pages.join(' ');
    expect(texte).toContain('Relevé de compte client');
    expect(texte).toContain('Report du solde antérieur');
    expect(texte).toContain(`Totaux de la période et solde dû ${enTexte(2250000)} ${enTexte(550000)} ${enTexte(reel)}`);
    expect(texte).toContain('En cas de désaccord sur ce relevé, merci de nous contacter sous huit jours.');
    expect(texte).toContain('Le client, pour accord');
    expect(texte).toContain(`Plafond de crédit : ${enTexte(10000000)} GNF`);
  });

  it('relevé client : client d’une autre entreprise → 404, jamais le document', async () => {
    const a = await contexte('Entreprise A');
    const b = await contexte('Entreprise B');
    const { client } = await compteClient(a);
    for (const format of ['pdf', 'csv']) {
      const r = await b.pdf(`/rapports/client/${client.id}?format=${format}`);
      expect(r.status).toBe(404);
      expect(r.headers['content-type']).not.toMatch(/pdf|csv/);
      expect((r.body as Buffer).toString()).not.toContain('Mamadou');
    }
    expect((await b.get(`/rapports/client/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await b.get('/rapports/client/pas-un-uuid')).status).toBe(400);
  });

  /**
   * Pertes construites pour Madina 46 % des pertes / 38 % du stock :
   * stock final 380 000 (Madina) et 620 000 (Matoto) au prix d'achat de 1 000 ;
   * pertes 46 000 (casse) et 54 000 (casse 34 000 + avoir refusé 20 000).
   */
  async function pertes(c: Awaited<ReturnType<typeof contexte>>) {
    const produit = (await c.post('/produits', { nom: 'Sac de ciment', prixAchat: 1000, prixVente: 1300 })).body;
    const madina = (await c.post('/emplacements', { nom: 'Dépôt Madina' })).body;
    const matoto = (await c.post('/emplacements', { nom: 'Réserve Matoto' })).body;
    const fournisseur = (await c.post('/fournisseurs', { nom: 'Ciments de Guinée' })).body;
    await c.post('/mouvements/entree', { produitId: produit.id, emplacementId: madina.id, quantite: 426 });
    await c.post('/mouvements/entree', { produitId: produit.id, emplacementId: matoto.id, quantite: 674 });
    await c.post('/pertes', { produitId: produit.id, emplacementId: madina.id, quantite: 46, motif: 'VOL', commentaire: 'Effraction du dépôt' });
    await c.post('/pertes', { produitId: produit.id, emplacementId: matoto.id, quantite: 34, motif: 'DEGAT_EAUX' });
    const [annulee] = (await c.post('/pertes', { produitId: produit.id, emplacementId: madina.id, quantite: 10, motif: 'CASSE_MANUTENTION' })).body;
    await c.post(`/pertes/${annulee.id}/annuler`, { motif: 'Sacs retrouvés intacts' });
    const retour = (await c.post('/retours-fournisseur', { fournisseurId: fournisseur.id, emplacementId: matoto.id, motif: 'Sacs durcis', lignes: [{ produitId: produit.id, quantite: 20 }] })).body;
    return { produit, madina, matoto, retourId: retour.id as string };
  }

  it('rapport de pertes : totaux, motifs, annulées non comptées, concentration calculée (46 % des pertes pour 38 % du stock)', async () => {
    const c = await contexte();
    const { retourId } = await pertes(c);
    // L'avoir est refusé par l'API : il entre dans les pertes sans nouvelle sortie de stock.
expect((await c.patch(`/retours-fournisseur/${retourId}/avoir`, { statut: 'REFUSE' })).status).toBe(200);

    const csv = await c.get('/rapports/pertes?format=csv');
    const lignes = csv.text.replace(/^\uFEFF/, '').trim().split('\r\n').slice(1).map((l) => l.split(';'));
    expect(lignes.map((l) => [l[1], l[3], l[6]])).toEqual([
      ['Sac de ciment', 'Vol', '46000'],
      ['Sac de ciment', 'Dégât des eaux', '34000'],
      ['Avoir refusé — Ciments de Guinée', 'Avoir fournisseur refusé', '20000'],
    ]);

    const r = await c.pdf('/rapports/pertes?signature=true');
    expect(r.status).toBe(200);
    const texte = (await lirePdf(r.body as Buffer)).pages.join(' ');
    expect(texte).toContain('Rapport de pertes');
    expect(texte).toContain(`Pertes de la période ${enTexte(100000)} GNF`);
    expect(texte).toContain('1 annulée(s), non comptée(s)');
    expect(texte).toContain(`Part du stock 10 % de ${enTexte(1000000)} GNF en stock`);
    expect(texte).toContain(`Dépôt Madina ${enTexte(46000)} 46 % ${enTexte(380000)} 38 % +8 pts`);
    expect(texte).toContain(`Réserve Matoto ${enTexte(54000)} 54 % ${enTexte(620000)} 62 % −8 pts`);
    expect(texte).toContain(`Total ${enTexte(100000)}`);
    expect(texte).toContain('Déclarée par');
    expect(texte).not.toContain('Sacs retrouvés intacts');
  });

  it('rapport de pertes : isolation multi-entreprise et période', async () => {
    const a = await contexte('Entreprise A');
    const b = await contexte('Entreprise B');
    await pertes(a);
    const csv = await b.get('/rapports/pertes?format=csv');
    expect(csv.text.replace(/^\uFEFF/, '').trim().split('\r\n')).toHaveLength(1);
    const ancien = await a.get('/rapports/pertes?format=csv&debut=2025-01-01&fin=2025-01-31');
    expect(ancien.text.replace(/^\uFEFF/, '').trim().split('\r\n')).toHaveLength(1);
  });

  it('paramètres invalides → 400', async () => {
    const c = await contexte();
    expect((await c.get('/rapports/stock?format=docx')).status).toBe(400);
    expect((await c.get('/rapports/stock?emplacementId=pas-un-uuid')).status).toBe(400);
  });
});
