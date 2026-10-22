import { api, messageErreur } from './api';

const CLE_STOCKAGE = 'stockflow.mouvements-en-attente';
/** Dernier refus du serveur sur un mouvement de la file (il bloque les suivants). */
const CLE_ECHEC = 'stockflow.synchro-echec';
/** Date ISO de la dernière synchronisation complète (file vide, données rechargées). */
const CLE_DERNIERE = 'stockflow.derniere-synchro';
const CLES_SUIVIES = [CLE_STOCKAGE, CLE_ECHEC, CLE_DERNIERE];

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

const abonnes = new Set<() => void>();

function notifier() {
  abonnes.forEach((rappel) => rappel());
}

function surStockage(evenement: StorageEvent) {
  // Un autre onglet a modifié la file : le compteur doit suivre.
  if (evenement.key && CLES_SUIVIES.includes(evenement.key)) notifier();
}

/** Abonnement aux changements de la file et de l'état de synchronisation. */
export function souscrireFile(rappel: () => void): () => void {
  if (abonnes.size === 0) window.addEventListener('storage', surStockage);
  abonnes.add(rappel);
  return () => {
    abonnes.delete(rappel);
    if (abonnes.size === 0) window.removeEventListener('storage', surStockage);
  };
}

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
    notifier();
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
  if (lireEchec()?.idLocal === idLocal) ecrireCle(CLE_ECHEC, null);
  ecrire(lire().filter((m) => m.idLocal !== idLocal));
}

export interface EchecSynchronisation {
  idLocal: string;
  message: string;
}

function lireCle(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrireCle(cle: string, valeur: string | null) {
  try {
    if (valeur === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, valeur);
  } catch {
    // Stockage indisponible : l'information est perdue, la file reste correcte.
  }
  notifier();
}

function lireEchec(): EchecSynchronisation | null {
  try {
    const brut = lireCle(CLE_ECHEC);
    return brut ? (JSON.parse(brut) as EchecSynchronisation) : null;
  } catch {
    return null;
  }
}

/** Note la fin d'une synchronisation complète (file vide, données rechargées). */
export function marquerSynchronise() {
  ecrireCle(CLE_DERNIERE, new Date().toISOString());
}

export interface EtatFile {
  mouvements: MouvementEnAttente[];
  echec: EchecSynchronisation | null;
  /** Date ISO de la dernière synchronisation complète, si connue. */
  derniere: string | null;
}

let cacheEtat: { cle: string; valeur: EtatFile } | null = null;

/**
 * Instantané de la file pour useSyncExternalStore : même référence tant
 * que le stockage n'a pas changé, sinon React boucle sur les rendus.
 */
export function etatFile(): EtatFile {
  const cle = CLES_SUIVIES.map(lireCle).join('\u0000');
  if (cacheEtat?.cle !== cle) {
    cacheEtat = { cle, valeur: { mouvements: lire(), echec: lireEchec(), derniere: lireCle(CLE_DERNIERE) } };
  }
  return cacheEtat.valeur;
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
async function rejouerFile(): Promise<ResultatSynchronisation> {
  // Relue sous verrou : un autre onglet a pu vider la file entre-temps.
  const enAttente = lire();
  const resultat: ResultatSynchronisation = { reussis: 0, echecs: [] };

  for (const mouvement of enAttente) {
    try {
      await api.post(ROUTE_PAR_TYPE[mouvement.type], mouvement.corps);
      supprimerMouvementEnAttente(mouvement.idLocal);
      resultat.reussis += 1;
    } catch (erreur) {
      const message = messageErreur(erreur, 'Échec de synchronisation.');
      // Refus du serveur (réponse reçue, ex. stock insuffisant) : il bloque
      // la file jusqu'à ce que l'utilisateur réessaie ou supprime le
      // mouvement. Une coupure réseau, elle, n'est pas un échec du mouvement.
      if ((erreur as { response?: unknown } | null)?.response) {
        ecrireCle(CLE_ECHEC, JSON.stringify({ idLocal: mouvement.idLocal, message }));
      }
      resultat.echecs.push({ mouvement, message });
      break;
    }
  }
  if (lire().length === 0) marquerSynchronise();

  return resultat;
}

let synchronisationEnCours: Promise<ResultatSynchronisation> | null = null;

/**
 * Point d'entrée unique de la synchronisation, exclusif à deux niveaux :
 * dans l'onglet (les déclenchements simultanés partagent la même
 * exécution) et entre onglets (verrou Web Locks), car la file est
 * partagée via localStorage — deux onglets revenant en ligne ensemble
 * enverraient sinon chacun les mêmes mouvements, en double.
 */
export function synchroniserMouvementsEnAttente(): Promise<ResultatSynchronisation> {
  synchronisationEnCours ??= (
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('stockflow.synchronisation', rejouerFile)
      : rejouerFile()
  ).finally(() => {
    synchronisationEnCours = null;
    notifier();
  });
  notifier();
  return synchronisationEnCours;
}

export function estEnSynchronisation(): boolean {
  return synchronisationEnCours !== null;
}
