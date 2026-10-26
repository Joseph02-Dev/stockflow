import { describe, expect, it } from 'vitest';
// Superposition de la file hors ligne à la base locale (frontend, SYNC-05),
// testée ici faute de lanceur de tests côté frontend.
import { clientsAvecFile, stockAvecFile, ventesAvecFile } from '../../../frontend/src/lib/superpositionFile.js';
import type { MouvementEnAttente } from '../../../frontend/src/lib/mouvementsHorsLigne.js';

let n = 0;
const op = (type: MouvementEnAttente['type'], corps: Record<string, unknown>, extra: Partial<MouvementEnAttente> = {}): MouvementEnAttente => ({
  idLocal: `l${++n}`,
  type,
  corps,
  resume: '',
  creeAt: `2026-10-26T10:0${n % 10}:00.000Z`,
  ...extra,
});
const ligne = (produitId: string, emplacementId: string, quantite: number) => ({ produitId, emplacementId, quantite, updatedAt: 'x' });
const quantite = (stock: { produitId: string; emplacementId: string; quantite: number }[], p: string, e: string) =>
  stock.find((s) => s.produitId === p && s.emplacementId === e)?.quantite;

describe('Vue locale : opérations en attente superposées à la base (SYNC-05)', () => {
  it('stock : entrées, sorties, pertes, transferts et ventes en attente', () => {
    const base = [ligne('riz', 'boutique', 10), ligne('riz', 'depot', 50)];
    const file = [
      op('entree', { produitId: 'riz', emplacementId: 'boutique', quantite: 5 }),
      op('sortie', { produitId: 'riz', emplacementId: 'boutique', quantite: 2 }),
      op('perte', { produitId: 'riz', emplacementId: 'depot', quantite: 1 }),
      op('transfert', { produitId: 'riz', emplacementSourceId: 'depot', emplacementDestinationId: 'boutique', quantite: 20 }),
      op('vente', { idClient: 'v1', emplacementId: 'boutique', lignes: [{ produitId: 'riz', quantite: 3 }, { produitId: 'sucre', quantite: 1 }] }),
    ];
    const vue = stockAvecFile(base, file);
    expect(quantite(vue, 'riz', 'boutique')).toBe(10 + 5 - 2 + 20 - 3);
    expect(quantite(vue, 'riz', 'depot')).toBe(50 - 1 - 20);
    // Produit absent de cet emplacement dans la base : la ligne apparaît (vente hors ligne sans stock connu).
    expect(quantite(vue, 'sucre', 'boutique')).toBe(-1);
    expect(vue.find((s) => s.produitId === 'sucre')?.enAttente).toBe(true);
    // La base elle-même n'est pas modifiée.
    expect(base.map((s) => s.quantite)).toEqual([10, 50]);
  });

  it('stock : sans opération en attente, la base telle quelle', () => {
    const base = [ligne('riz', 'boutique', 10)];
    expect(stockAvecFile(base, [])).toEqual(base);
  });

  it('clients : créés et modifiés hors ligne', () => {
    const base = [{ id: 'c1', nom: 'Mariama Sow', archive: false, updatedAt: 'x' }];
    const file = [
      op('client', { idClient: 'c2', nom: 'Ibrahima Camara', categorie: 'GROS' }),
      op('client', { nom: 'Mariama Sow Diallo' }, { chemin: '/clients/c1', methode: 'PATCH' }),
    ];
    const vue = clientsAvecFile(base, file);
    expect(vue.find((c) => c.id === 'c2')).toMatchObject({ nom: 'Ibrahima Camara', categorie: 'GROS', enAttente: true });
    expect(vue.find((c) => c.id === 'c1')).toMatchObject({ nom: 'Mariama Sow Diallo', enAttente: true });
    // Une modification n'est pas une vente ni un mouvement de stock.
    expect(stockAvecFile([], file)).toEqual([]);
  });

  it('ventes : celles en attente en tête, datées de leur saisie, sans doublon', () => {
    const base = [{ id: 'v-ancienne', createdAt: '2026-10-25T09:00:00.000Z', clientId: null, emplacementId: 'boutique', updatedAt: 'x' }];
    const file = [op('vente', { idClient: 'v-hl', clientId: 'c2', emplacementId: 'boutique', saisieHorsLigneAt: '2026-10-26T08:00:00.000Z', lignes: [] })];
    const vue = ventesAvecFile(base, file);
    expect(vue.map((v) => v.id)).toEqual(['v-hl', 'v-ancienne']);
    expect(vue[0]).toMatchObject({ createdAt: '2026-10-26T08:00:00.000Z', clientId: 'c2', numero: null, enAttente: true });
    // Déjà synchronisée (même identifiant) : une seule fois.
    expect(ventesAvecFile([...base, { ...base[0], id: 'v-hl', createdAt: '2026-10-26T08:00:00.000Z' }], file).filter((v) => v.id === 'v-hl')).toHaveLength(1);
  });
});
