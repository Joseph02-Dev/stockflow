/**
 * Choix d'une règle de rangement (putaway d'Odoo), pur et testé
 * unitairement. La règle la plus précise l'emporte :
 *   1. ce produit, arrivant à cet emplacement ;
 *   2. ce produit, quelle que soit l'arrivée ;
 *   3. sa catégorie, arrivant à cet emplacement ;
 *   4. sa catégorie, quelle que soit l'arrivée.
 */
export interface RegleCandidate {
  produitId: string | null;
  categorieId: string | null;
  emplacementReceptionId: string | null;
  emplacementId: string;
}

export function regleApplicable<R extends RegleCandidate>(
  regles: R[],
  produit: { id: string; categorieId: string | null },
  emplacementReceptionId: string,
): R | null {
  const score = (r: R) => {
    const cible = r.produitId === produit.id ? 2 : r.categorieId !== null && r.categorieId === produit.categorieId ? 1 : 0;
    if (cible === 0) return 0;
    if (r.emplacementReceptionId !== null && r.emplacementReceptionId !== emplacementReceptionId) return 0;
    return cible * 2 + (r.emplacementReceptionId === emplacementReceptionId ? 1 : 0);
  };
  let meilleure: R | null = null;
  let meilleurScore = 0;
  for (const r of regles) {
    const s = score(r);
    // Ne jamais « ranger » à l'emplacement même d'arrivée : rien à faire.
    if (s > meilleurScore && r.emplacementId !== emplacementReceptionId) {
      meilleure = r;
      meilleurScore = s;
    }
  }
  return meilleure;
}
