import type { ChampImport } from '@/lib/import/champs';
import type { Encodage, Separateur, TableauLu } from '@/lib/import/lecture';

export interface FichierLu extends TableauLu {
  nom: string;
  format: 'csv' | 'xlsx';
  encodage?: Encodage;
  separateur?: Separateur;
}

/** Choix d'une colonne : un champ, à choisir (''), ou ignorée. */
export type ChoixColonne = ChampImport | '' | 'IGNORER';

export interface ProblemeLigne {
  gravite: 'BLOQUANT' | 'A_VERIFIER';
  message: string;
  champ?: ChampImport;
  doublon?: { valeur: string; lignes: number[]; conservee: number };
}

export interface RapportImport {
  id: string;
  lignesAnalysees: number;
  compteurs: { aCreer: number; aMettreAJour: number; aCorriger: number; bloquees: number };
  avecQuantite: boolean;
  suiviParLot: number;
  erreursGlobales: string[];
  categoriesInconnues: { nom: string; lignes: number }[];
  marquesInconnues: { nom: string; lignes: number }[];
  problemes: {
    numero: number;
    nom: string | null;
    action: 'CREER' | 'METTRE_A_JOUR' | 'BLOQUEE';
    produitExistant: { id: string; nom: string } | null;
    problemes: ProblemeLigne[];
  }[];
}

export interface OptionsImport {
  emplacementId?: string;
  categories: Record<string, string>;
  marques: Record<string, string>;
  conserver: number[];
  ignorerBloquees: boolean;
}

export interface ResultatImport {
  id: string;
  lignesCreees: number;
  lignesMisesAJour: number;
  lignesIgnorees: number;
  mouvementsCrees: number;
  categoriesCreees: string[];
  marquesCreees: string[];
  suiviParLot: number;
  dureeMs: number;
}
