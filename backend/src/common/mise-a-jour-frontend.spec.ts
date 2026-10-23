import { describe, it, expect } from 'vitest';
// Code frontend (reprise après déploiement), testé ici faute de lanceur de
// tests côté frontend — même approche que le test de parité du calcul.
import {
  DELAI_ENTRE_RECHARGEMENTS_MS,
  moduleOuRechargement,
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

describe('moduleOuRechargement', () => {
  it('rend le module chargé normalement', async () => {
    const module = { default: 'page' };
    await expect(moduleOuRechargement(Promise.resolve(module))).resolves.toBe(module);
  });

  it('reste en attente quand Vite résout l’import à undefined (rechargement en cours)', async () => {
    let regle = false;
    void moduleOuRechargement(Promise.resolve(undefined)).then(
      () => (regle = true),
      () => (regle = true),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(regle).toBe(false);
  });

  it('laisse passer un vrai échec de chargement', async () => {
    await expect(moduleOuRechargement(Promise.reject(new Error('réseau')))).rejects.toThrow('réseau');
  });
});

