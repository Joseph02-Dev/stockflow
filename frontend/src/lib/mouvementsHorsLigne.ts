import { api } from './api';

const CLE_STOCKAGE = 'stockflow.mouvements-en-attente';

export type TypeMouvementHorsLigne = 'entree' | 'sortie' | 'transfert';

export interface MouvementEnAttente {
  /** Identifiant local, distinct des identifiants serveur (jamais envoyé). */
  idLocal: string;
  type: TypeMouvementHorsLigne;
  /** Corps exact à envoyer tel quel à la route correspondante. */
  corps: Record<string, unknown>;
  /** Libellé lisible pour l'affichage de la file (ex. nom du produit). */
  resume: string;
  creeAt: string;
}

const ROUTE_PAR_TYPE: Record<TypeMouvementHorsLigne, string> = {
  entree: '/mouvements/entree',
  sortie: '/mouvements/sortie',
  transfert: '/mouvements/transfert',
};

function lire(): MouvementEnAttente[] {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    return brut ? (JSON.parse(brut) as MouvementEnAttente[]) : [];
  } catch {
    // Stockage corrompu ou indisponible (navigation privée stricte, quota
    // dépassé) : on repart d'une file vide plutôt que de faire planter
    // l'application.
    return [];
  }
}

function ecrire(mouvements: MouvementEnAttente[]) {
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(mouvements));
  } catch {
    // Écriture impossible : la file en mémoire reste correcte pour cette
    // session, mais ne survivra pas à un rechargement. Acceptable en
    // dernier recours plutôt que de bloquer la saisie.
  }
}

export function listerMouvementsEnAttente(): MouvementEnAttente[] {
  return lire();
}

export function nombreMouvementsEnAttente(): number {
  return lire().length;
}

export function ajouterMouvementEnAttente(
  type: TypeMouvementHorsLigne,
  corps: Record<string, unknown>,
  resume: string,
): MouvementEnAttente {
  const mouvement: MouvementEnAttente = {
    idLocal: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    corps,
    resume,
    creeAt: new Date().toISOString(),
  };
  ecrire([...lire(), mouvement]);
  return mouvement;
}

export function supprimerMouvementEnAttente(idLocal: string) {
  ecrire(lire().filter((m) => m.idLocal !== idLocal));
}

export interface ResultatSynchronisation {
  reussis: number;
  echecs: { mouvement: MouvementEnAttente; message: string }[];
}

/**
 * Rejoue la file dans l'ordre de création. S'arrête au premier échec
 * pour préserver l'ordre chronologique des mouvements (un transfert
 * rejoué avant l'entrée qui l'a précédé pourrait échouer pour stock
 * insuffisant alors qu'il était valide au moment de la saisie) — les
 * éléments suivants restent en file, à retenter plus tard.
 */
export async function synchroniserMouvementsEnAttente(): Promise<ResultatSynchronisation> {
  const enAttente = lire();
  const resultat: ResultatSynchronisation = { reussis: 0, echecs: [] };

  for (const mouvement of enAttente) {
    try {
      await api.post(ROUTE_PAR_TYPE[mouvement.type], mouvement.corps);
      supprimerMouvementEnAttente(mouvement.idLocal);
      resultat.reussis += 1;
    } catch (erreur) {
      const message =
        erreur instanceof Object && 'response' in erreur
          ? ((erreur as { response?: { data?: { message?: string } } }).response?.data?.message ??
            'Échec de synchronisation.')
          : 'Échec de synchronisation.';
      resultat.echecs.push({ mouvement, message });
      break;
    }
  }

  return resultat;
}
