import { describe, expect, it } from 'vitest';
import { cleNom, lireDate, lireEntier } from './normalisation.js';

describe('Lecture des valeurs importées (serveur)', () => {
  it('72000, 72 000, 72 000 (insécable), 72,000 et 72.000 donnent tous l’entier 72000', () => {
    for (const valeur of [
      '72000',
      '72 000',
      '72 000',
      '72 000',
      '72,000',
      '72.000',
      ' 72 000 GNF ',
    ]) {
      expect(lireEntier(valeur)).toBe(72000);
    }
    expect(lireEntier('')).toBeNull();
    expect(lireEntier('   ')).toBeNull();
    expect(lireEntier('gratuit')).toBe('illisible');
  });

  it('lit jj/mm/aaaa, jj-mm-aaaa et aaaa-mm-jj, signale l’ambiguïté jour/mois', () => {
    expect(lireDate('25/12/2026')).toEqual({
      iso: '2026-12-25',
      ambigue: false,
    });
    expect(lireDate('25-12-2026')).toEqual({
      iso: '2026-12-25',
      ambigue: false,
    });
    expect(lireDate('2027-01-04')).toEqual({
      iso: '2027-01-04',
      ambigue: false,
    });
    expect(lireDate('03/04/2027')).toEqual({
      iso: '2027-04-03',
      ambigue: true,
    });
    expect(lireDate('4/1/2027')).toEqual({ iso: '2027-01-04', ambigue: true });
    expect(lireDate('32/13/2026')).toBe('illisible');
    expect(lireDate('31/02/2027')).toBe('illisible');
    expect(lireDate('janvier 2027')).toBe('illisible');
    expect(lireDate('')).toBeNull();
  });

  it('compare les noms sans casse ni accents', () => {
    expect(cleNom('Matériaux')).toBe(cleNom(' MATERIAUX '));
  });
});
