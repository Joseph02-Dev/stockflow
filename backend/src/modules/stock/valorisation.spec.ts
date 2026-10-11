import { describe, expect, it } from 'vitest';
import { consommerCouches, coutMoyen, variationStock } from './valorisation.js';

describe('Valorisation — règles pures', () => {
  it('effet sur le stock total : entrée +, sortie −, transfert 0', () => {
    expect(variationStock('FOURNISSEUR', 'INTERNE', 5)).toBe(5);
    expect(variationStock('INTERNE', 'CLIENT', 5)).toBe(-5);
    expect(variationStock('INTERNE', 'INVENTAIRE', -3)).toBe(-3);
    expect(variationStock('INVENTAIRE', 'INTERNE', 3)).toBe(3);
    expect(variationStock('INTERNE', 'INTERNE', 5)).toBe(0);
  });

  it('consommation FIFO : couches les plus anciennes d’abord, manque signalé', () => {
    const couches = [
      { id: 'a', quantiteRestante: 4, coutUnitaire: 100 },
      { id: 'b', quantiteRestante: 10, coutUnitaire: 130 },
    ];
    expect(consommerCouches(couches, 6)).toEqual({
      prises: [{ id: 'a', quantite: 4 }, { id: 'b', quantite: 2 }],
      valeurFifo: 4 * 100 + 2 * 130,
      manquant: 0,
    });
    expect(consommerCouches(couches, 20).manquant).toBe(6);
  });

  it('coût moyen pondéré : arrondi au GNF, nul sans stock', () => {
    expect(coutMoyen(1000n, 3)).toBe(333);
    expect(coutMoyen(0, 0)).toBeNull();
  });
});
