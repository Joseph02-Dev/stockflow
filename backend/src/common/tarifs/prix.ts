export type CategorieTarifaire = 'GROS' | 'DEMI_GROS' | 'DETAIL';

export interface PrixProduit {
  prixVente: number | null;
  prixGros: number | null;
  prixDemiGros: number | null;
}

/**
 * Prix unitaire (HT, GNF) d'un produit pour une catégorie de client.
 * Seule source de cette règle côté serveur :
 *   GROS      → prixGros ?? prixVente
 *   DEMI_GROS → prixDemiGros ?? prixVente
 *   DETAIL    → prixVente
 * Le repli sur prixVente garde vendables les produits sans prix de gros.
 * null : le produit n'a aucun prix applicable.
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
