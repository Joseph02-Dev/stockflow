import { describe, expect, it } from 'vitest';
import {
  comparerFefo,
  joursRestants,
  repartirFefo,
  type LotFefo,
} from './fefo.js';

const jour = (s: string) => new Date(`${s}T00:00:00.000Z`);
const lot = (
  numero: string,
  quantite: number,
  peremption: string | null,
  recu = '2026-01-01',
): LotFefo => ({
  id: numero,
  numero,
  quantite,
  datePeremption: peremption ? jour(peremption) : null,
  recuAt: jour(recu),
});

describe('Règles FEFO', () => {
  it('trie par péremption croissante, lots sans date en dernier, puis réception la plus ancienne', () => {
    const lots = [
      lot('SANS', 5, null),
      lot('C', 5, '2027-06-01'),
      lot('A-RECENT', 5, '2027-01-04', '2026-03-01'),
      lot('A-ANCIEN', 5, '2027-01-04', '2026-02-01'),
    ];
    expect([...lots].sort(comparerFefo).map((l) => l.numero)).toEqual([
      'A-ANCIEN',
      'A-RECENT',
      'C',
      'SANS',
    ]);
  });

  it('répartit une sortie sur plusieurs lots, le plus urgent d’abord', () => {
    const plan = repartirFefo(
      [lot('TARD', 10, '2027-09-01'), lot('TOT', 4, '2027-01-01')],
      7,
    );
    expect(plan?.map((p) => [p.lot.numero, p.quantite])).toEqual([
      ['TOT', 4],
      ['TARD', 3],
    ]);
  });

  it('renvoie null quand l’ensemble des lots ne suffit pas', () => {
    expect(
      repartirFefo([lot('A', 2, '2027-01-01'), lot('B', 3, null)], 6),
    ).toBeNull();
  });

  it('compte les jours restants à la journée, négatifs une fois périmé', () => {
    const maintenant = new Date('2026-10-03T17:45:00.000Z');
    expect(joursRestants(jour('2026-10-03'), maintenant)).toBe(0);
    expect(joursRestants(jour('2026-10-10'), maintenant)).toBe(7);
    expect(joursRestants(jour('2026-10-02'), maintenant)).toBe(-1);
  });
});
