export type Tranche = 'PERIME' | 'MOINS_7' | 'DE_8_A_30' | 'PLUS_30';

export interface ResumePeremptions {
  seuilJours: number;
  sousSurveillance: number;
  tranches: {
    tranche: Tranche;
    lots: number;
    unites: number;
    valeur: number;
  }[];
}

export interface LotPeremption {
  id: string;
  numero: string;
  quantite: number;
  datePeremption: string;
  recuAt: string;
  joursRestants: number;
  tranche: Tranche;
  valeur: number;
  produit: {
    id: string;
    nom: string;
    reference: string | null;
    photoUrl: string | null;
    prixAchat: number | null;
    prixVente: number | null;
    uniteMesure: string | null;
  };
  emplacement: { id: string; nom: string };
  fournisseur: { id: string; nom: string } | null;
}

/** Lot d'un produit (fiche produit, réception). */
export interface LotProduit {
  id: string;
  numero: string;
  quantite: number;
  datePeremption: string | null;
  recuAt: string;
  joursRestants: number | null;
  sortiraEnPremier: boolean;
  emplacement: { id: string; nom: string };
}
