import { describe, expect, it } from 'vitest';
import { refusNumerosSerie, repartirLots, strategieEffective } from './strategie-sortie.js';

const jour = (j: number) => new Date(Date.UTC(2026, 0, j));
const lots = [
  { id: 'a', numero: 'A', quantite: 5, recuAt: jour(1), datePeremption: jour(30) },
  { id: 'b', numero: 'B', quantite: 5, recuAt: jour(5), datePeremption: jour(10) },
  { id: 'c', numero: 'C', quantite: 5, recuAt: jour(9), datePeremption: null },
];
const ordre = (plan: ReturnType<typeof repartirLots>) => plan?.map((p) => `${p.lot.id}:${p.quantite}`);

describe('Stratégies de sortie', () => {
  it('FEFO : péremption la plus proche, lots sans date en dernier', () => {
    expect(ordre(repartirLots(lots, 12, 'FEFO'))).toEqual(['b:5', 'a:5', 'c:2']);
  });

  it('FIFO : réception la plus ancienne ; LIFO : la plus récente', () => {
    expect(ordre(repartirLots(lots, 7, 'FIFO'))).toEqual(['a:5', 'b:2']);
    expect(ordre(repartirLots(lots, 7, 'LIFO'))).toEqual(['c:5', 'b:2']);
  });

  it('stock insuffisant : aucun plan (rien ne doit être écrit)', () => {
    expect(repartirLots(lots, 16, 'FIFO')).toBeNull();
  });

  it('stratégie effective : celle de l’emplacement, sinon de l’entreprise ; FEFO sans le module', () => {
    expect(strategieEffective(false, 'LIFO', 'FIFO')).toBe('FEFO');
    expect(strategieEffective(true, 'LIFO', null)).toBe('LIFO');
    expect(strategieEffective(true, 'LIFO', 'FIFO')).toBe('FIFO');
  });

  it('numéros de série : autant que d’unités, ni vide ni doublon', () => {
    expect(refusNumerosSerie(['SN1', 'SN2'], 2)).toBeNull();
    expect(refusNumerosSerie(['SN1'], 2)).toMatch(/exactement 2/);
    expect(refusNumerosSerie(['SN1', ' '], 2)).toMatch(/vide/);
    expect(refusNumerosSerie(['sn1', 'SN1 '], 2)).toMatch(/« SN1 » est saisi deux fois/);
  });
});
