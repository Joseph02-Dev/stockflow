import type { VarianteBadge } from '@/components/ui/Badge';

export type StatutStock = 'rupture' | 'faible' | 'ok';

/**
 * Même règle que le backend (mouvements.service) : rupture à 0, stock
 * faible strictement sous le seuil. Dupliquée ici uniquement pour
 * l'affichage — la source de vérité des alertes reste le serveur.
 */
export function statutStock(quantite: number, seuil: number): StatutStock {
  if (quantite <= 0) return 'rupture';
  if (quantite < seuil) return 'faible';
  return 'ok';
}

export const libelleStatut: Record<StatutStock, string> = {
  rupture: 'Rupture',
  faible: 'Sous le seuil',
  ok: 'En stock',
};

export const varianteStatut: Record<StatutStock, VarianteBadge> = {
  rupture: 'rupture',
  faible: 'faible',
  ok: 'ok',
};
