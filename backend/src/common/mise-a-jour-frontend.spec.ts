import { describe, it, expect } from 'vitest';
// Code frontend (reprise après déploiement), testé ici faute de lanceur de
// tests côté frontend — même approche que le test de parité du calcul.
import {
  DELAI_ENTRE_RECHARGEMENTS_MS,
  rechargementAutorise,
} from '../../../frontend/src/lib/miseAJour.js';

describe('rechargementAutorise', () => {
  const maintenant = 1_000_000;

  it('autorise le premier rechargement', () => {
    expect(rechargementAutorise(maintenant, null)).toBe(true);
  });

  it('refuse un second rechargement trop rapproché (pas de boucle)', () => {
    expect(rechargementAutorise(maintenant, maintenant - 5_000)).toBe(false);
  });

  it('autorise à nouveau une fois le délai écoulé', () => {
    expect(rechargementAutorise(maintenant, maintenant - DELAI_ENTRE_RECHARGEMENTS_MS)).toBe(true);
  });

  it('autorise si la valeur stockée est illisible', () => {
    expect(rechargementAutorise(maintenant, Number('abc'))).toBe(true);
  });
});
