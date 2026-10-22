export interface Emplacement {
  id: string;
  nom: string;
  chemin?: string;
}

export interface LigneStock {
  produitId: string;
  emplacementId: string;
  quantite: number;
  produit: { nom: string; reference: string | null; seuilAlerte: number; photoUrl: string | null; uniteMesure: string | null };
  emplacement: { nom: string };
}

/** Emplacement tel qu'affiché : sa teinte le suit sur la barre de répartition et les légendes. */
export interface LieuAffiche {
  id: string;
  nom: string;
  teinte: string;
}

/** Une teinte par emplacement, dans l'ordre de la liste ; les couleurs de statut restent aux états du stock. */
export const TEINTES_LIEUX = ['var(--color-action)', 'var(--color-accent)', '#2f6fb3', '#8a6d3b', '#5b7083', '#b0487a'];
