export type StatutAvoir = 'ATTENDU' | 'RECU' | 'REFUSE';

export interface RetourFournisseur {
  id: string;
  motif: string;
  valeurTotale: number;
  statutAvoir: StatutAvoir;
  avoirRecuAt: string | null;
  refuseAt: string | null;
  createdAt: string;
  fournisseur: { id: string; nom: string };
  emplacement: { id: string; nom: string };
  utilisateur: { id: string; nom: string };
  mouvements: {
    id: string;
    quantite: number;
    valeurUnitaire: number | null;
    valeurTotale: number | null;
    produit: { id: string; nom: string; photoUrl: string | null };
    lot: { numero: string } | null;
  }[];
}

export interface ListeRetoursFournisseur {
  retours: RetourFournisseur[];
  avoirsEnAttente: { nombre: number; valeur: number };
}
