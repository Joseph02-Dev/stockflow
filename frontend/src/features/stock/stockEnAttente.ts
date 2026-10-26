import { useMemo, useSyncExternalStore } from 'react';
import { etatFile, souscrireFile, type MouvementEnAttente } from '@/lib/mouvementsHorsLigne';
import { stockAvecFile } from '@/lib/superpositionFile';

/**
 * Stock affiché après les opérations encore en attente d'envoi (entrées,
 * sorties, transferts, pertes, ventes) : ce qui a été saisi sans réseau se
 * voit aussitôt. Une ligne nouvelle (produit pas encore présent à cet
 * emplacement) n'apparaît que si le produit et l'emplacement figurent déjà
 * ailleurs dans la liste, pour en connaître les noms.
 */
/** Ligne de stock reçue de GET /stock, sous la forme qu'en garde chaque écran. */
interface LigneDeStock {
  produitId: string;
  emplacementId: string;
  quantite: number;
  produit: unknown;
  emplacement: unknown;
}

export function ajusterStockEnAttente<L extends LigneDeStock>(lignes: L[], file: MouvementEnAttente[]): L[] {
  if (file.length === 0) return lignes;
  const cle = (l: { produitId: string; emplacementId: string }) => `${l.produitId}|${l.emplacementId}`;
  const existantes = new Map(lignes.map((l) => [cle(l), l]));
  const produits = new Map(lignes.map((l) => [l.produitId, l.produit]));
  const emplacements = new Map(lignes.map((l) => [l.emplacementId, l.emplacement]));
  const vue = stockAvecFile(
    lignes.map((l) => ({ produitId: l.produitId, emplacementId: l.emplacementId, quantite: l.quantite, updatedAt: '' })),
    file,
  );
  return vue.flatMap((v) => {
    const existante = existantes.get(cle(v));
    if (existante) return [{ ...existante, quantite: v.quantite }];
    const produit = produits.get(v.produitId);
    const emplacement = emplacements.get(v.emplacementId);
    return produit && emplacement
      ? [{ produitId: v.produitId, emplacementId: v.emplacementId, quantite: v.quantite, produit, emplacement } as unknown as L]
      : [];
  });
}

/** Lignes de stock reçues (serveur ou base de l'appareil), ajustées des opérations en attente. */
export function useStockAvecAttente<L extends LigneDeStock>(lignes: L[] | undefined): L[] | undefined {
  const file = useSyncExternalStore(souscrireFile, etatFile, etatFile).mouvements;
  return useMemo(() => (lignes ? ajusterStockEnAttente(lignes, file) : lignes), [lignes, file]);
}
