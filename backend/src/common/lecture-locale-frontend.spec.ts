import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
// Lecture locale (frontend, ticket SYNC-06) : réponses de l'API reconstituées
// depuis la base de l'appareil, testées ici faute de lanceur côté frontend.
import { baseLocale, effacerBasesLocales } from '../../../frontend/src/lib/baseLocale.js';
import { lireLocalement } from '../../../frontend/src/lib/lectureLocale.js';

const stockage = new Map<string, string>();
const session = { utilisateur: { id: 'u', email: 'a@b.c', nom: 'Awa', role: 'ADMIN' }, entreprise: { id: 'e1', nom: 'Boutique' } };

describe('Lecture locale (SYNC-06)', () => {
  beforeAll(() => {
    // Session lue par lib/session.ts (localStorage du navigateur).
    const faux = {
      getItem: (c: string) => stockage.get(c) ?? null,
      setItem: (c: string, v: string) => void stockage.set(c, v),
      removeItem: (c: string) => void stockage.delete(c),
    };
    Object.assign(globalThis, { localStorage: faux, sessionStorage: { ...faux, getItem: () => null } });
  });

  afterEach(async () => {
    stockage.clear();
    await effacerBasesLocales();
  });

  async function remplir() {
    stockage.set('stockflow.session', JSON.stringify(session));
    const base = baseLocale('e1')!;
    await base.emplacements.bulkPut([
      { id: 'depot', nom: 'Dépôt', archive: false, parentId: null, updatedAt: 'x' },
      { id: 'rayon', nom: 'Rayon A', archive: false, parentId: 'depot', updatedAt: 'x' },
      { id: 'ancien', nom: 'Ancien local', archive: true, parentId: null, updatedAt: 'x' },
    ]);
    await base.categories.put({ id: 'cat', nom: 'Épicerie', updatedAt: 'x' });
    await base.produits.bulkPut([
      { id: 'riz', nom: 'Riz parfumé 25 kg', archive: false, categorieId: 'cat', marqueId: null, reference: 'RIZ-25', seuilAlerte: 5, updatedAt: 'x' },
      { id: 'huile', nom: 'Huile 5 L', archive: false, categorieId: null, marqueId: null, modeleId: 'm1', updatedAt: 'x' },
      { id: 'vieux', nom: 'Riz brisé', archive: true, categorieId: null, marqueId: null, updatedAt: 'x' },
    ]);
    await base.stock.bulkPut([
      { produitId: 'riz', emplacementId: 'depot', quantite: 40, updatedAt: 'x' },
      { produitId: 'riz', emplacementId: 'rayon', quantite: 6, updatedAt: 'x' },
      { produitId: 'huile', emplacementId: 'rayon', quantite: 3, updatedAt: 'x' },
    ]);
    await base.clients.bulkPut([
      { id: 'c1', nom: 'Mariama Sow', nomCommerce: 'Boutique Madina', telephone: '+224 622 00 00 01', archive: false, updatedAt: 'x' },
      { id: 'c2', nom: 'Ibrahima Camara', nomCommerce: null, telephone: '+224 655 11 22 33', archive: false, updatedAt: 'x' },
      { id: 'c3', nom: 'Ancien client', archive: true, updatedAt: 'x' },
    ]);
    await base.etat.put({ cle: 'synchronisation', curseur: 'c', derniereReussite: '2026-10-26T10:00:00.000Z' });
    return base;
  }

  it('emplacements : chemin complet, archivés exclus par défaut, triés', async () => {
    await remplir();
    const liste = (await lireLocalement('/emplacements')) as { id: string; chemin: string }[];
    expect(liste.map((e) => e.chemin)).toEqual(['Dépôt', 'Dépôt / Rayon A']);
    expect(((await lireLocalement('/emplacements', { archive: 'true' })) as unknown[]).length).toBe(3);
  });

  it('stock : forme du serveur, filtre par emplacement et par produit', async () => {
    await remplir();
    const rayon = (await lireLocalement('/stock?emplacement_id=rayon')) as { produitId: string; quantite: number; produit: { nom: string }; emplacement: { nom: string } }[];
    expect(rayon.map((l) => [l.produit.nom, l.emplacement.nom, l.quantite]).sort()).toEqual([
      ['Huile 5 L', 'Rayon A', 3],
      ['Riz parfumé 25 kg', 'Rayon A', 6],
    ]);
    expect(rayon[0].produit).toHaveProperty('seuilAlerte');
    expect(((await lireLocalement('/stock?', { produit_id: 'riz' })) as unknown[]).length).toBe(2);
  });

  it('produits : recherche sans réseau, catégorie jointe, archivés à la demande', async () => {
    await remplir();
    const riz = (await lireLocalement('/produits?search=RIZ')) as { id: string; categorie: { nom: string } | null }[];
    expect(riz.map((p) => p.id)).toEqual(['riz']);
    expect(riz[0].categorie?.nom).toBe('Épicerie');
    expect(((await lireLocalement('/produits?search=riz&archive=true')) as { id: string }[]).map((p) => p.id)).toEqual(['vieux', 'riz']);
    const huile = ((await lireLocalement('/produits')) as { id: string; modele: unknown }[]).find((p) => p.id === 'huile');
    expect(huile?.modele).toEqual({ id: 'm1', nom: '' });
  });

  it('clients : recherche par nom, commerce ou téléphone, triés par nom', async () => {
    await remplir();
    const ids = async (url: string) => ((await lireLocalement(url)) as { id: string }[]).map((c) => c.id);
    expect(await ids('/clients?')).toEqual(['c2', 'c1']);
    expect(await ids('/clients?search=madina')).toEqual(['c1']);
    expect(await ids('/clients?search=655')).toEqual(['c2']);
    expect(await ids('/clients?archive=true')).toEqual(['c3', 'c2', 'c1']);
  });

  it('rien sans session, sans synchronisation réussie, ou pour une route non couverte', async () => {
    expect(await lireLocalement('/produits')).toBeUndefined();
    const base = await remplir();
    expect(await lireLocalement('/ventes')).toBeUndefined();
    await base.etat.put({ cle: 'synchronisation', curseur: null, derniereReussite: null });
    expect(await lireLocalement('/produits')).toBeUndefined();
  });
});
