import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from './prisma.service.js';
import { crediterStock, debiterStock } from '../modules/stock/moteur-stock.js';

/** Tables recopiées sur l'appareil (docs/adr/0001-application-web-local-first.md, SYNC-01). */
const TABLES_SYNCHRONISEES = [
  'produit',
  'stock',
  'emplacement',
  'categorie',
  'marque',
  'client',
  'fournisseur',
  'alerte',
  'lot',
  'vente',
  'mouvement',
];

describe('Synchronisation — date de modification tenue par la base, PostgreSQL réel', () => {
  const prisma = new PrismaService();
  let entrepriseId: string;

  beforeAll(async () => {
    entrepriseId = (await prisma.entreprise.create({ data: { nom: `Synchro ${Date.now()}` } })).id;
  });

  afterAll(async () => {
    await prisma.stock.deleteMany({ where: { produit: { entrepriseId } } });
    await prisma.produit.deleteMany({ where: { entrepriseId } });
    await prisma.emplacement.deleteMany({ where: { entrepriseId } });
    await prisma.entreprise.delete({ where: { id: entrepriseId } });
    await prisma.$disconnect();
  });

  it('chaque table synchronisée a sa colonne updated_at, son déclencheur et son index', async () => {
    const colonnes = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name = 'updated_at' AND is_nullable = 'NO'`;
    const declencheurs = await prisma.$queryRaw<{ table: string }[]>`
      SELECT event_object_table AS "table" FROM information_schema.triggers
      WHERE trigger_name LIKE '%_maj_updated_at' AND event_manipulation = 'UPDATE'`;
    const index = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_indexes WHERE schemaname = current_schema() AND indexdef LIKE '%updated_at%'`;
    for (const table of TABLES_SYNCHRONISEES) {
      expect(colonnes.map((c) => c.table_name), table).toContain(table);
      expect(declencheurs.map((d) => d.table), table).toContain(table);
      expect(index.map((i) => i.tablename), table).toContain(table);
    }
  });

  it('une modification avance updated_at, y compris le stock modifié par le moteur', async () => {
    const produit = await prisma.produit.create({ data: { entrepriseId, nom: 'Riz parfumé 25 kg' } });
    const emplacement = await prisma.emplacement.create({ data: { entrepriseId, nom: 'Dépôt Madina' } });
    const cle = { produitId: produit.id, emplacementId: emplacement.id };

    // now() d'une transaction : une pause garantit un horodatage plus récent.
    await new Promise((r) => setTimeout(r, 20));
    const modifie = await prisma.produit.update({ where: { id: produit.id }, data: { nom: 'Riz parfumé 50 kg' } });
    expect(modifie.updatedAt.getTime()).toBeGreaterThan(produit.updatedAt.getTime());

    await prisma.$transaction((tx) => crediterStock(tx, cle, 10));
    const avant = await prisma.stock.findUniqueOrThrow({ where: { produitId_emplacementId: cle } });
    await new Promise((r) => setTimeout(r, 20));
    await prisma.$transaction((tx) => debiterStock(tx, cle, 3));
    const apres = await prisma.stock.findUniqueOrThrow({ where: { produitId_emplacementId: cle } });
    expect(apres.quantite).toBe(7);
    expect(apres.updatedAt.getTime()).toBeGreaterThan(avant.updatedAt.getTime());

    // SQL brut (correction manuelle, script) : la date suit aussi.
    await new Promise((r) => setTimeout(r, 20));
    await prisma.$executeRaw`UPDATE produit SET nom = 'Riz brisé 25 kg' WHERE id = ${produit.id}`;
    const brut = await prisma.produit.findUniqueOrThrow({ where: { id: produit.id } });
    expect(brut.updatedAt.getTime()).toBeGreaterThan(modifie.updatedAt.getTime());
  });
});
