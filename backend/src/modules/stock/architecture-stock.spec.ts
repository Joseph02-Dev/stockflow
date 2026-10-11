import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Règle d'architecture de la double entrée : seul le moteur de stock écrit
 * les quantités (stock, lot) et les mouvements. Un service qui ferait
 * `stock = stock + 1` lui-même contournerait les verrous, le contrôle du
 * stock suffisant et l'origine/destination du mouvement.
 */
const RACINE = join(import.meta.dirname, '../..');
const AUTORISES = new Set(['modules/stock/moteur-stock.ts']);
const ECRITURE_INTERDITE =
  /\.(stock|lot)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\.mouvement\.(create|createMany)\(/;

function fichiersSource(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return entree.name === 'generated' ? [] : fichiersSource(chemin);
    return entree.name.endsWith('.ts') && !entree.name.endsWith('.spec.ts') && !entree.name.includes('test.utils')
      ? [chemin]
      : [];
  });
}

describe('Moteur de stock — point d’écriture unique', () => {
  it('aucune écriture directe de stock, de lot ou de mouvement hors du moteur', () => {
    const fautes = fichiersSource(RACINE)
      .filter((f) => !AUTORISES.has(relative(RACINE, f)))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((ligne, i) => ({ ligne: ligne.trim(), numero: i + 1 }))
          .filter(({ ligne }) => ECRITURE_INTERDITE.test(ligne))
          .map(({ ligne, numero }) => `${relative(RACINE, f)}:${numero} — ${ligne}`),
      );
    expect(fautes).toEqual([]);
  });
});
