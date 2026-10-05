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
    return { entreprise, get, pdf, post };
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
    if (process.env.SORTIE_PDF) (await import('node:fs')).writeFileSync(process.env.SORTIE_PDF, r.body as Buffer);
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

  it('paramètres invalides → 400', async () => {
    const c = await contexte();
    expect((await c.get('/rapports/stock?format=docx')).status).toBe(400);
    expect((await c.get('/rapports/stock?emplacementId=pas-un-uuid')).status).toBe(400);
  });
});
