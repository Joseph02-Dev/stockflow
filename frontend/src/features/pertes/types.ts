export type MotifPerte = 'CASSE_MANUTENTION' | 'DEGAT_EAUX' | 'VOL' | 'ERREUR_SAISIE' | 'AUTRE';
export type MotifSynthese = MotifPerte | 'AVOIR_REFUSE';

export interface Perte {
  id: string;
  quantite: number;
  motifPerte: MotifPerte;
  valeurUnitaire: number | null;
  valeurTotale: number | null;
  commentaire: string | null;
  photoUrl: string | null;
  createdAt: string;
  annuleAt: string | null;
  motifAnnulation: string | null;
  retourClientId: string | null;
  produit: { id: string; nom: string; reference: string | null; photoUrl: string | null; uniteMesure: string | null };
  emplacement: { id: string; nom: string };
  utilisateur: { id: string; nom: string };
  annulePar: { id: string; nom: string } | null;
  lot: { id: string; numero: string } | null;
}

export interface SynthesePertes {
  mois: string;
  total: number;
  nombre: number;
  moyenne: number;
  totalPrecedent: number;
  evolutionPourcentage: number | null;
  valeurStock: number;
  partDuStock: number;
  parMotif: { motif: MotifSynthese; valeur: number; nombre: number }[];
  parEmplacement: { emplacementId: string; nom: string; valeur: number; partPertes: number; partStock: number }[];
  evolution: { mois: string; valeur: number }[];
  analyse: string | null;
}
