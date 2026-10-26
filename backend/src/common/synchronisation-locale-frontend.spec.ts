import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
// Moteur de synchronisation de la base locale (frontend, ticket SYNC-04),
// testé ici faute de lanceur de tests côté frontend.
import { baseLocale, effacerBasesLocales } from '../../../frontend/src/lib/baseLocale.js';
import {
  CurseurRefuse,
  synchroniserBase,
  type LirePage,
  type ReponseSync,
} from '../../../frontend/src/lib/synchronisationLocale.js';

const vide = { categories: [], marques: [] };
const page = (tables: ReponseSync['tables'], curseur: string, encore = false, existants = vide): ReponseSync => ({
  curseur,
  encore,
  tables,
  existants,
});
const maintenant = () => new Date('2026-10-26T10:00:00.000Z');

describe('Synchronisation de la base locale (SYNC-04)', () => {
  afterEach(async () => {
    await effacerBasesLocales();
  });

  it('enchaîne les pages jusqu’à être à jour, puis ne demande que la suite', async () => {
    const base = baseLocale('e1')!;
    const demandes: (string | null)[] = [];
    const pages = [
      page({ produits: [{ id: 'p1', nom: 'Riz', updatedAt: 'x' }] }, 'c1', true),
      page({ produits: [{ id: 'p2', nom: 'Sucre', updatedAt: 'x' }], stock: [{ produitId: 'p1', emplacementId: 'e', quantite: 4, updatedAt: 'x' }] }, 'c2'),
      page({ produits: [{ id: 'p1', nom: 'Riz parfumé', updatedAt: 'y' }] }, 'c3'),
    ];
    const lire: LirePage = async (curseur) => {
      demandes.push(curseur);
      return pages[demandes.length - 1];
    };

    expect(await synchroniserBase(base, lire, maintenant)).toBe('2026-10-26T10:00:00.000Z');
    expect(demandes).toEqual([null, 'c1']);
    expect(await base.produits.count()).toBe(2);
    expect(await base.etat.get('synchronisation')).toMatchObject({ curseur: 'c2', derniereReussite: '2026-10-26T10:00:00.000Z' });

    // Synchronisation suivante : depuis le curseur, la ligne revenue remplace l'ancienne.
    await synchroniserBase(base, lire, maintenant);
    expect(demandes.at(-1)).toBe('c2');
    expect((await base.produits.get('p1'))?.nom).toBe('Riz parfumé');
    expect(await base.produits.count()).toBe(2);
  });

  it('retire les catégories et marques supprimées sur le serveur', async () => {
    const base = baseLocale('e1')!;
    await base.categories.bulkPut([
      { id: 'c-garde', nom: 'Boissons', updatedAt: 'x' },
      { id: 'c-supprimee', nom: 'Épicerie', updatedAt: 'x' },
    ]);
    await synchroniserBase(base, async () => page({}, 'c1', false, { categories: ['c-garde'], marques: [] }), maintenant);
    expect((await base.categories.toArray()).map((c) => c.id)).toEqual(['c-garde']);
  });

  it('associations fournisseur-produit : remplacées en entier à chaque synchronisation', async () => {
    const base = baseLocale('e1')!;
    await base.fournisseursProduits.bulkPut([{ fournisseurId: 'f1', produitId: 'p1' }, { fournisseurId: 'f1', produitId: 'retire' }]);
    await synchroniserBase(
      base,
      async () => ({ ...page({}, 'c1'), associations: { fournisseursProduits: [{ fournisseurId: 'f1', produitId: 'p1' }, { fournisseurId: 'f2', produitId: 'p1' }] } }),
      maintenant,
    );
    expect((await base.fournisseursProduits.toArray()).map((a) => `${a.fournisseurId}:${a.produitId}`).sort()).toEqual(['f1:p1', 'f2:p1']);
  });

  it('curseur refusé par le serveur : vide la base et repart d’un instantané complet', async () => {
    const base = baseLocale('e1')!;
    await base.produits.put({ id: 'ancien', nom: 'Produit supprimé', archive: false, categorieId: null, marqueId: null, updatedAt: 'x' });
    await base.etat.put({ cle: 'synchronisation', curseur: 'perime', derniereReussite: null });
    const lire: LirePage = async (curseur) => {
      if (curseur === 'perime') throw new CurseurRefuse();
      return page({ produits: [{ id: 'p1', nom: 'Riz', updatedAt: 'x' }] }, 'neuf');
    };
    await synchroniserBase(base, lire, maintenant);
    expect((await base.produits.toArray()).map((p) => p.id)).toEqual(['p1']);
    expect((await base.etat.get('synchronisation'))?.curseur).toBe('neuf');
  });

  it('coupure en cours de route : garde ce qui est appliqué et reprend au dernier curseur', async () => {
    const base = baseLocale('e1')!;
    let appels = 0;
    const lire: LirePage = async () => {
      appels += 1;
      if (appels === 2) throw new Error('Network Error');
      return page({ produits: [{ id: `p${appels}`, nom: 'X', updatedAt: 'x' }] }, `c${appels}`, appels === 1);
    };
    await expect(synchroniserBase(base, lire, maintenant)).rejects.toThrow('Network Error');
    expect(await base.produits.count()).toBe(1);
    expect(await base.etat.get('synchronisation')).toMatchObject({ curseur: 'c1', derniereReussite: null });
  });

  it('oublie les ventes et mouvements de plus de 90 jours', async () => {
    const base = baseLocale('e1')!;
    const mouvement = (id: string, createdAt: string) => ({ id, createdAt, produitId: 'p', emplacementId: 'e', updatedAt: 'x' });
    await base.mouvements.bulkPut([mouvement('recent', '2026-10-01T00:00:00.000Z'), mouvement('ancien', '2026-06-01T00:00:00.000Z')]);
    await synchroniserBase(base, async () => page({}, 'c1'), maintenant);
    expect((await base.mouvements.toArray()).map((m) => m.id)).toEqual(['recent']);
  });
});
