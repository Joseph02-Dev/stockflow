/**
 * Contrat entre l'assistant et un fournisseur de modèle de langage. Le
 * service de l'assistant ne connaît que ces types : changer de fournisseur
 * revient à écrire une autre implémentation (voir fournisseur-anthropic.ts),
 * et les tests utilisent une implémentation simulée, sans clé ni réseau.
 */

/** Message texte de l'historique envoyé par le navigateur. */
export interface MessageTexte {
  role: 'user' | 'assistant';
  contenu: string;
}

/** Outil proposé au modèle : nom, description et schéma JSON de ses arguments. */
export interface DefinitionOutil {
  nom: string;
  description: string;
  schema: Record<string, unknown>;
}

/** Appel d'outil demandé par le modèle (arguments NON validés). */
export interface AppelOutil {
  id: string;
  nom: string;
  arguments: unknown;
}

export interface ResultatOutil {
  appelId: string;
  /** JSON renvoyé au modèle. */
  contenu: string;
  erreur: boolean;
}

/**
 * - reponse : le modèle a terminé ;
 * - outils : il attend les résultats de `appels` ;
 * - refus : il a décliné la demande (filtres de sécurité du fournisseur) ;
 * - tronque : réponse coupée (limite de longueur).
 */
export type FinTour = 'reponse' | 'outils' | 'refus' | 'tronque';

export interface TourIA {
  fin: FinTour;
  texte: string;
  appels: AppelOutil[];
  jetons: { entree: number; sortie: number };
}

/** Une conversation en cours chez le fournisseur (historique interne conservé). */
export interface SessionIA {
  /** Premier tour sans argument ; ensuite, les résultats des outils demandés. */
  tour(resultats?: ResultatOutil[]): Promise<TourIA>;
}

export interface FournisseurIA {
  /** Faux si la configuration manque (clé absente) : l'assistant répond 503. */
  readonly disponible: boolean;
  demarrer(parametres: { systeme: string; contexte: string; outils: DefinitionOutil[]; historique: MessageTexte[] }): SessionIA;
}

/** Panne du fournisseur (réseau, délai, quota, erreur 5xx) : jamais l'erreur brute au client. */
export class ErreurFournisseurIA extends Error {
  constructor(
    readonly motif: string,
    options?: { cause?: unknown },
  ) {
    super(`Fournisseur IA indisponible : ${motif}`, options);
    this.name = 'ErreurFournisseurIA';
  }
}

export const FOURNISSEUR_IA = Symbol('FOURNISSEUR_IA');
