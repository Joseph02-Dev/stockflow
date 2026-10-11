import { describe, expect, it } from 'vitest';
import { fournisseurRetenu, quantiteACommander, sousEmplacements } from './calcul-reappro.js';
import { regleApplicable } from '../rangement/regle-rangement.js';

describe('Réapprovisionnement min/max — règles pures', () => {
  it('sous le minimum : remonte au maximum, arrondi au multiple supérieur', () => {
    expect(quantiteACommander(3, 10, 50)).toBe(47);
    expect(quantiteACommander(3, 10, 50, 12)).toBe(48);
    expect(quantiteACommander(-2, 0, 10)).toBe(12);
  });

  it('au minimum ou au-dessus : rien à commander', () => {
    expect(quantiteACommander(10, 10, 50)).toBe(0);
    expect(quantiteACommander(70, 10, 50)).toBe(0);
  });

  it('fournisseur : celui de la règle, sinon l’unique associé, sinon aucun', () => {
    expect(fournisseurRetenu('f1', ['f2', 'f3'])).toBe('f1');
    expect(fournisseurRetenu(null, ['f2'])).toBe('f2');
    expect(fournisseurRetenu(null, ['f2', 'f3'])).toBeNull();
    expect(fournisseurRetenu(null, [])).toBeNull();
  });

  it('sous-emplacements : l’emplacement et tous ses descendants', () => {
    const arbre = sousEmplacements([
      { id: 'depot', parentId: null },
      { id: 'zoneA', parentId: 'depot' },
      { id: 'allee1', parentId: 'zoneA' },
      { id: 'autre', parentId: null },
    ]);
    expect([...arbre('depot')].sort()).toEqual(['allee1', 'depot', 'zoneA']);
    expect([...arbre('allee1')]).toEqual(['allee1']);
  });
});

describe('Rangement — la règle la plus précise l’emporte', () => {
  const produit = { id: 'p', categorieId: 'c' };
  const regle = (r: Partial<{ produitId: string; categorieId: string; emplacementReceptionId: string }>, destination: string) => ({
    produitId: r.produitId ?? null,
    categorieId: r.categorieId ?? null,
    emplacementReceptionId: r.emplacementReceptionId ?? null,
    emplacementId: destination,
  });

  it('produit avant catégorie, arrivée précise avant arrivée quelconque', () => {
    const regles = [
      regle({ categorieId: 'c' }, 'Z-cat'),
      regle({ categorieId: 'c', emplacementReceptionId: 'quai' }, 'Z-cat-quai'),
      regle({ produitId: 'p' }, 'Z-prod'),
    ];
    expect(regleApplicable(regles, produit, 'quai')?.emplacementId).toBe('Z-prod');
    expect(regleApplicable(regles.slice(0, 2), produit, 'quai')?.emplacementId).toBe('Z-cat-quai');
    expect(regleApplicable(regles.slice(0, 2), produit, 'porte')?.emplacementId).toBe('Z-cat');
  });

  it('aucune règle applicable : autre produit, autre arrivée, ou destination = arrivée', () => {
    expect(regleApplicable([regle({ produitId: 'x' }, 'Z')], produit, 'quai')).toBeNull();
    expect(regleApplicable([regle({ produitId: 'p', emplacementReceptionId: 'porte' }, 'Z')], produit, 'quai')).toBeNull();
    expect(regleApplicable([regle({ produitId: 'p' }, 'quai')], produit, 'quai')).toBeNull();
  });
});
