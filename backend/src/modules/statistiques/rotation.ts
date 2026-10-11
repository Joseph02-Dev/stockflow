/**
 * Indicateurs de rotation d'un produit sur une période, purs et testés
 * unitairement.
 *
 * - rotation : sorties nettes de la période / stock actuel (combien de fois
 *   le stock a « tourné ») ;
 * - couverture : jours de vente que le stock actuel couvre au rythme de la
 *   période ;
 * - dormant : du stock, mais aucune sortie nette sur la période.
 */
export function indicateursRotation(p: { stock: number; sorties: number; jours: number }) {
  const sorties = Math.max(0, p.sorties);
  return {
    rotation: p.stock > 0 ? Math.round((sorties / p.stock) * 100) / 100 : null,
    couvertureJours: sorties > 0 && p.stock > 0 ? Math.round(p.stock / (sorties / p.jours)) : null,
    dormant: p.stock > 0 && sorties === 0,
  };
}
