/** Stratégies de sortie des lots (miroir de l'enum StrategieSortie de l'API). */
export type StrategieSortie = 'FEFO' | 'FIFO' | 'LIFO';

export const STRATEGIES: { valeur: StrategieSortie; libelle: string; aide: string }[] = [
  { valeur: 'FEFO', libelle: 'FEFO — premier périmé, premier sorti', aide: 'Alimentaire, pharmacie, cosmétique' },
  { valeur: 'FIFO', libelle: 'FIFO — premier entré, premier sorti', aide: 'Rotation à l’ancienneté' },
  { valeur: 'LIFO', libelle: 'LIFO — dernier entré, premier sorti', aide: 'Vrac, matériaux empilés' },
];

/** Numéros de série saisis : un par ligne (ou séparés par des virgules), sans vides. */
export function lireNumerosSerie(texte: string): string[] {
  return texte
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter(Boolean);
}
