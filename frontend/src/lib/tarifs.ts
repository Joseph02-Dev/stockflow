export type CategorieTarifaire = 'GROS' | 'DEMI_GROS' | 'DETAIL';

export interface PrixProduit {
  prixVente: number | null;
  prixGros?: number | null;
  prixDemiGros?: number | null;
}

/**
 * Prix unitaire (HT, GNF) d'un produit pour une catégorie de client.
 * Miroir exact de backend/src/common/tarifs/prix.ts, qui fait foi (le
 * serveur recalcule toujours) ; ici, il sert seulement à l'affichage :
 *   GROS → prixGros ?? prixVente, DEMI_GROS → prixDemiGros ?? prixVente,
 *   DETAIL → prixVente.
 */
export function resoudrePrix(produit: PrixProduit, categorie: CategorieTarifaire): number | null {
  switch (categorie) {
    case 'GROS':
      return produit.prixGros ?? produit.prixVente;
    case 'DEMI_GROS':
      return produit.prixDemiGros ?? produit.prixVente;
    case 'DETAIL':
      return produit.prixVente;
  }
}
