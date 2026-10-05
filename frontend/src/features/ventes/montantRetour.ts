import type { LigneVente } from './types';

/**
 * Montant réellement facturé pour `quantite` unités d'une ligne : prix
 * figé, remise de la vente au prorata, TVA du taux de la ligne. Même
 * calcul que le serveur (retours-client.service.ts) : entiers, arrondi
 * au plus proche, demi vers le haut.
 */
export function montantFacture(
  ligne: Pick<LigneVente, 'prixUnitaire' | 'tauxTva'>,
  quantite: number,
  vente: { sousTotal: number; remise: number },
): number {
  if (vente.sousTotal <= 0 || quantite <= 0) return 0;
  const numerateur = BigInt(quantite * ligne.prixUnitaire) * BigInt(vente.sousTotal - vente.remise) * BigInt(100 + ligne.tauxTva);
  const denominateur = BigInt(vente.sousTotal) * 100n;
  return Number((numerateur * 2n + denominateur) / (denominateur * 2n));
}
