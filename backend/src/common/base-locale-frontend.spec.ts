import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
// Base locale de l'appareil (frontend, ticket SYNC-03), testée ici faute de
// lanceur de tests côté frontend — même approche que mise-a-jour-frontend.
import { baseLocale, effacerBasesLocales } from '../../../frontend/src/lib/baseLocale.js';

const noms = async () => (await indexedDB.databases()).map((b) => b.name).sort();

describe('Base locale de l’appareil (SYNC-03)', () => {
  afterEach(async () => {
    await effacerBasesLocales();
  });

  it('une base par entreprise, avec les tables et clés attendues', async () => {
    const base = baseLocale('entreprise-a')!;
    await base.produits.put({ id: 'p1', nom: 'Riz 25 kg', archive: false, categorieId: null, marqueId: null, updatedAt: '2026-10-26' });
    await base.stock.bulkPut([
      { produitId: 'p1', emplacementId: 'e1', quantite: 5, updatedAt: '2026-10-26' },
      { produitId: 'p1', emplacementId: 'e2', quantite: 2, updatedAt: '2026-10-26' },
    ]);
    // Une même ligne reçue deux fois (marge de GET /sync) remplace sans dupliquer.
    await base.stock.put({ produitId: 'p1', emplacementId: 'e1', quantite: 4, updatedAt: '2026-10-27' });

    expect(await base.stock.count()).toBe(2);
    expect((await base.stock.get(['p1', 'e1']))?.quantite).toBe(4);
    expect(await base.stock.where('emplacementId').equals('e2').count()).toBe(1);
    expect(await base.produits.where('nom').startsWithIgnoreCase('riz').count()).toBe(1);
    expect(base.tables.map((t) => t.name).sort()).toEqual(
      ['alertes', 'categories', 'clients', 'emplacements', 'etat', 'fournisseurs', 'lots', 'marques', 'mouvements', 'produits', 'stock', 'ventes'],
    );

    // Autre entreprise : autre base, rien en commun.
    const autre = baseLocale('entreprise-b')!;
    expect(await autre.produits.count()).toBe(0);
    expect(await noms()).toEqual(expect.arrayContaining(['stockflow-local-entreprise-a', 'stockflow-local-entreprise-b']));
  });

  it('la déconnexion efface toutes les bases locales, mais pas la file d’opérations', async () => {
    await baseLocale('entreprise-a')!.etat.put({ cle: 'synchronisation', curseur: 'abc', derniereReussite: null });
    await baseLocale('entreprise-b')!.etat.put({ cle: 'synchronisation', curseur: 'def', derniereReussite: null });
    // File d'opérations hors ligne (lib/stockageLocal.ts) : à garder.
    await new Promise<void>((resoudre) => {
      const requete = indexedDB.open('stockflow', 1);
      requete.onupgradeneeded = () => requete.result.createObjectStore('donnees');
      requete.onsuccess = () => {
        requete.result.close();
        resoudre();
      };
    });

    await effacerBasesLocales();
    expect(await noms()).toEqual(['stockflow']);

    // Reconnexion : base neuve, vide.
    expect(await baseLocale('entreprise-a')!.etat.get('synchronisation')).toBeUndefined();
  });
});
