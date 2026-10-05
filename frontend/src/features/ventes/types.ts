import type { Client } from '@/features/clients/types';
import type { TvaParTaux } from '@/lib/calculVente';

// AVOIR : règlement créé par un retour client (déduit de la dette, jamais encaissé).
export type ModePaiement = 'ESPECES' | 'ORANGE_MONEY' | 'MTN_MOMO' | 'CREDIT' | 'AVOIR';
export type ModeReglement = Exclude<ModePaiement, 'CREDIT'>;
export type StatutVente = 'VALIDEE' | 'ANNULEE';

export interface LigneVente {
  id: string;
  produitId: string;
  libelle: string;
  quantite: number;
  prixUnitaire: number;
  tauxTva: number;
  montantLigne: number;
}

export interface Reglement {
  id: string;
  montant: number;
  mode: ModeReglement;
  createdAt: string;
  utilisateur: { nom: string };
}

export interface VenteDetail {
  id: string;
  numero: string;
  statut: StatutVente;
  sousTotal: number;
  remise: number;
  tauxRemise: number;
  montantTva: number;
  tvaParTaux: TvaParTaux[];
  total: number;
  paye: number;
  resteDu: number;
  montantARembourser: number;
  modePaiement: ModePaiement;
  echeanceAt: string | null;
  annuleeAt: string | null;
  motifAnnulation: string | null;
  createdAt: string;
  client: Client | null;
  emplacement: { id: string; nom: string };
  utilisateur: { id: string; nom: string };
  entreprise: { nom: string };
  lignes: LigneVente[];
  reglements: Reglement[];
  retours: RetourClientResume[];
  alertePlafond?: { plafondCredit: number; solde: number; depassement: number } | null;
}

export interface VenteResume {
  id: string;
  numero: string;
  statut: StatutVente;
  total: number;
  paye: number;
  resteDu: number;
  modePaiement: ModePaiement;
  createdAt: string;
  nombreLignes: number;
  client: { id: string; nom: string; telephone: string | null } | null;
  emplacement: { id: string; nom: string };
}

export interface SituationClient {
  clientId: string;
  solde: number;
  plafondCredit: number | null;
}

export type EtatRetourClient = 'REMISE_EN_STOCK' | 'CASSE' | 'RETOUR_FOURNISSEUR';
export type CompensationRetour = 'DEDUIRE_DETTE' | 'REMBOURSEMENT';

export interface RetourClientResume {
  id: string;
  etat: EtatRetourClient;
  compensation: CompensationRetour;
  montant: number;
  createdAt: string;
  utilisateur: { nom: string };
  lignes: { ligneVenteId: string; quantite: number; montant: number }[];
}

export interface RetourClientCree {
  id: string;
  montant: number;
  etat: EtatRetourClient;
  compensation: CompensationRetour;
  resteDuVente: number;
  soldeClient: number | null;
}
