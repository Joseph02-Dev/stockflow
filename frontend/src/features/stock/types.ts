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
