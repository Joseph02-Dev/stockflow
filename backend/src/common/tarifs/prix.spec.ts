import { describe, it, expect } from 'vitest';
import { resoudrePrix } from './prix.js';

describe('resoudrePrix', () => {
  const complet = { prixVente: 95_000, prixGros: 88_000, prixDemiGros: 91_000 };

  it('applique le prix propre à chaque catégorie', () => {
    expect(resoudrePrix(complet, 'GROS')).toBe(88_000);
    expect(resoudrePrix(complet, 'DEMI_GROS')).toBe(91_000);
    expect(resoudrePrix(complet, 'DETAIL')).toBe(95_000);
  });

  it('retombe sur prixVente quand le prix de gros ou de demi-gros manque', () => {
    const detailSeul = { prixVente: 95_000, prixGros: null, prixDemiGros: null };
    expect(resoudrePrix(detailSeul, 'GROS')).toBe(95_000);
    expect(resoudrePrix(detailSeul, 'DEMI_GROS')).toBe(95_000);
  });

  it('un prix de gros à 0 est un vrai prix, pas une absence', () => {
    expect(resoudrePrix({ prixVente: 95_000, prixGros: 0, prixDemiGros: null }, 'GROS')).toBe(0);
  });

  it('renvoie null si aucun prix ne s’applique', () => {
    expect(resoudrePrix({ prixVente: null, prixGros: null, prixDemiGros: null }, 'DETAIL')).toBeNull();
    expect(resoudrePrix({ prixVente: null, prixGros: 80_000, prixDemiGros: null }, 'DEMI_GROS')).toBeNull();
  });
});
