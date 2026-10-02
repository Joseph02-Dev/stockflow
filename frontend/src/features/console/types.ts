export type EtatEntreprise = 'ACTIVE' | 'SUSPENDUE' | 'INACTIVE' | 'JAMAIS_DEMARREE';

export interface LigneEntreprise {
  id: string;
  nom: string;
  createdAt: string;
  statut: 'ACTIVE' | 'SUSPENDUE';
  suspendueAt: string | null;
  motifSuspension: string | null;
  emplacements: number;
  utilisateurs: number;
  references: number;
  mouvements30j: number;
  derniereActivite: string | null;
  etat: EtatEntreprise;
}

export interface Page<T> {
  total: number;
  page: number;
  taille: number;
  elements: T[];
}

export type ActionAudit =
  | 'CONNEXION'
  | 'CONSULTATION_ENTREPRISE'
  | 'SUSPENSION'
  | 'RETABLISSEMENT'
  | 'MODIFICATION_REGLAGES';

export const LIBELLES_ETAT: Record<EtatEntreprise, string> = {
  ACTIVE: 'Active',
  SUSPENDUE: 'Suspendue',
  INACTIVE: 'Inactive',
  JAMAIS_DEMARREE: 'Jamais démarrée',
};
