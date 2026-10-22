import { api, messageErreur } from './api';
import { ecrireValeur, lireValeur } from './stockageLocal';

/** Clé de la file dans IndexedDB, et dans localStorage en repli (et avant migration). */
const CLE_STOCKAGE = 'stockflow.mouvements-en-attente';
/** Dernier refus du serveur sur un mouvement de la file (il bloque les suivants). */
const CLE_ECHEC = 'stockflow.synchro-echec';
/** Date ISO de la dernière synchronisation complète (file vide, données rechargées). */
const CLE_DERNIERE = 'stockflow.derniere-synchro';
const CLES_SUIVIES = [CLE_STOCKAGE, CLE_ECHEC, CLE_DERNIERE];
/** Prévient les autres onglets qu'une file a changé dans IndexedDB. */
const CANAL = 'stockflow.file-hors-ligne';

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
  // Un autre onglet a modifié l'échec, la dernière synchro ou la file de
  // repli (localStorage) : l'affichage doit suivre.
  if (evenement.key && CLES_SUIVIES.includes(evenement.key)) {
    if (evenement.key === CLE_STOCKAGE && !indexedDbActif) memoire = lireRepli();
    notifier();
  }
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

/**
 * Identifiant d'opération créé sur l'appareil, envoyé avec le mouvement :
 * le serveur n'applique jamais deux fois le même (réponse perdue, renvoi
 * depuis deux onglets).
 */
export function nouvelIdClient(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Contexte non sécurisé (http hors localhost) : UUID v4 construit à la main.
  const octets = crypto.getRandomValues(new Uint8Array(16));
  octets[6] = (octets[6] & 0x0f) | 0x40;
  octets[8] = (octets[8] & 0x3f) | 0x80;
  const hex = [...octets].map((o) => o.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Chaque mouvement de la file porte un idClient (les anciens en reçoivent un). */
function avecIdClient(mouvements: MouvementEnAttente[]): MouvementEnAttente[] {
  return mouvements.map((m) =>
    typeof m.corps.idClient === 'string' ? m : { ...m, corps: { ...m.corps, idClient: nouvelIdClient() } },
  );
}

// La file vit en mémoire (lecture synchrone pour l'affichage) et est
// recopiée dans IndexedDB à chaque changement. Sans IndexedDB, repli sur
// localStorage, comme avant.
let memoire: MouvementEnAttente[] = [];
let indexedDbActif = true;
let ecritures: Promise<void> = Promise.resolve();
const canal = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CANAL) : null;

function lireRepli(): MouvementEnAttente[] {
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE);
    return brut ? (JSON.parse(brut) as MouvementEnAttente[]) : [];
  } catch {
    // Stockage corrompu ou indisponible : on repart d'une file vide
    // plutôt que de faire planter l'application.
    return [];
  }
}

function ecrireRepli(mouvements: MouvementEnAttente[]) {
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(mouvements));
  } catch {
    // Écriture impossible : la file en mémoire reste correcte pour cette
    // session, mais ne survivra pas à un rechargement.
  }
}

async function lireStockage(): Promise<MouvementEnAttente[]> {
  if (indexedDbActif) {
    try {
      return (await lireValeur<MouvementEnAttente[]>(CLE_STOCKAGE)) ?? [];
    } catch {
      indexedDbActif = false;
    }
  }
  return lireRepli();
}

/** Recopie la file actuelle (et non celle du moment de l'appel) dans le stockage. */
async function persister(): Promise<void> {
  if (indexedDbActif) {
    try {
      await ecrireValeur(CLE_STOCKAGE, memoire);
      canal?.postMessage('maj');
      return;
    } catch {
      indexedDbActif = false;
    }
  }
  ecrireRepli(memoire);
}

/** Relit la file quand un autre onglet l'a changée (nos écritures d'abord). */
async function recharger(): Promise<void> {
  await ecritures;
  memoire = await lireStockage();
  notifier();
}

/**
 * Démarrage : charge la file d'IndexedDB et y reprend une éventuelle file
 * laissée dans localStorage par la version précédente, ainsi que les
 * mouvements saisis pendant le chargement (sans doublon). Les écritures
 * demandées entre-temps attendent la fin de ce chargement.
 */
function initialiser(): Promise<void> {
  const ancienne = lireRepli();
  ecritures = lireStockage().then(async (stockee) => {
    const connus = new Set<string>();
    const fusion = [...stockee, ...ancienne, ...memoire].filter((m) => !connus.has(m.idLocal) && connus.add(m.idLocal));
    memoire = avecIdClient(fusion);
    notifier();
    if (!indexedDbActif) return;
    if (fusion.length !== stockee.length) await persister();
    if (ancienne.length > 0) {
      try {
        localStorage.removeItem(CLE_STOCKAGE);
      } catch {
        // Sans effet : la file est déjà dans IndexedDB.
      }
    }
  });
  return ecritures;
}

const pret = typeof window === 'undefined' ? Promise.resolve() : initialiser();
canal?.addEventListener('message', () => void recharger());

function lire(): MouvementEnAttente[] {
  return memoire;
}

function ecrire(mouvements: MouvementEnAttente[]) {
  memoire = avecIdClient(mouvements);
  notifier();
  // Écritures en série, chacune recopiant la file du moment : la dernière
  // version gagne toujours, même si un changement arrive pendant l'écriture.
  ecritures = ecritures.then(persister, persister);
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
    corps: { ...corps, idClient: typeof corps.idClient === 'string' ? corps.idClient : nouvelIdClient() },
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

let cacheEtat: { file: MouvementEnAttente[]; cle: string; valeur: EtatFile } | null = null;

/**
 * Instantané de la file pour useSyncExternalStore : même référence tant
 * que le stockage n'a pas changé, sinon React boucle sur les rendus.
 */
export function etatFile(): EtatFile {
  const cle = [CLE_ECHEC, CLE_DERNIERE].map(lireCle).join('\u0000');
  if (cacheEtat?.file !== memoire || cacheEtat.cle !== cle) {
    cacheEtat = { file: memoire, cle, valeur: { mouvements: memoire, echec: lireEchec(), derniere: lireCle(CLE_DERNIERE) } };
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
  await pret;
  await recharger();
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
