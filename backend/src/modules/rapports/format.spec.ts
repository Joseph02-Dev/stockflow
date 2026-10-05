import { describe, expect, it } from 'vitest';
import {
  ESPACE_FINE_PDF,
  formaterDate,
  formaterDateHeure,
  formaterMontant,
  formaterPourcentage,
  formaterQuantiteSignee,
} from './format.js';

const F = ' ';

describe('Formateurs des rapports (sans ICU)', () => {
  it('montants : espace insécable fine tous les trois chiffres', () => {
    expect(formaterMontant(1284760000)).toBe(`1${F}284${F}760${F}000`);
    expect(formaterMontant(0)).toBe('0');
    expect(formaterMontant(999)).toBe('999');
    expect(formaterMontant(1000)).toBe(`1${F}000`);
    expect(formaterMontant(-2450000)).toBe(`−2${F}450${F}000`);
    expect(formaterMontant(1284760000, ESPACE_FINE_PDF)).toBe('1 284 760 000');
  });

  it('ne dépend ni de toLocaleString ni d’Intl', () => {
    const toLocaleString = Number.prototype.toLocaleString;
    const NumberFormat = Intl.NumberFormat;
    Number.prototype.toLocaleString = () => {
      throw new Error('ICU interdit');
    };
    (Intl as { NumberFormat: unknown }).NumberFormat = () => {
      throw new Error('ICU interdit');
    };
    try {
      expect(formaterMontant(1234567)).toBe(`1${F}234${F}567`);
      expect(formaterPourcentage(46.25)).toBe('46,3 %');
      expect(formaterDateHeure(new Date('2026-09-11T16:42:09Z'))).toBe('11/09/2026 à 16:42');
    } finally {
      Number.prototype.toLocaleString = toLocaleString;
      (Intl as { NumberFormat: unknown }).NumberFormat = NumberFormat;
    }
  });

  it('dates en UTC (Guinée, UTC+0) : JJ/MM/AAAA et « à HH:MM »', () => {
    expect(formaterDate(new Date('2026-09-11T23:59:00Z'))).toBe('11/09/2026');
    expect(formaterDate(new Date('2026-01-05T00:00:00Z'))).toBe('05/01/2026');
    expect(formaterDateHeure(new Date('2026-09-11T16:42:00Z'))).toBe('11/09/2026 à 16:42');
    expect(formaterDateHeure(new Date('2026-03-02T07:05:00Z'))).toBe('02/03/2026 à 07:05');
  });

  it('pourcentages et quantités signées', () => {
    expect(formaterPourcentage(46)).toBe('46 %');
    expect(formaterPourcentage(38.04)).toBe('38 %');
    expect(formaterPourcentage(0.5)).toBe('0,5 %');
    expect(formaterPourcentage(1250)).toBe(`1${F}250 %`);
    expect(formaterQuantiteSignee(12)).toBe('+12');
    expect(formaterQuantiteSignee(-3)).toBe('−3');
    expect(formaterQuantiteSignee(0)).toBe('0');
  });
});
