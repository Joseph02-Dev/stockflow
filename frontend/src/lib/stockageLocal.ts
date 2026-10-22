/**
 * Petit magasin clé → valeur dans IndexedDB, pour les données hors ligne
 * qui doivent survivre à la fermeture de l'onglet (file de mouvements).
 * Plus fiable que localStorage : pas de limite à quelques Mo, écritures
 * transactionnelles, et non bloquant pour l'interface.
 *
 * Sans IndexedDB (navigation privée stricte, navigateur ancien), les
 * fonctions échouent : l'appelant retombe alors sur localStorage.
 */

const NOM_BASE = 'stockflow';
const MAGASIN = 'donnees';

let base: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  base ??= new Promise<IDBDatabase>((resoudre, rejeter) => {
    if (typeof indexedDB === 'undefined') {
      rejeter(new Error('IndexedDB indisponible.'));
      return;
    }
    const requete = indexedDB.open(NOM_BASE, 1);
    requete.onupgradeneeded = () => requete.result.createObjectStore(MAGASIN);
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error ?? new Error('Ouverture d’IndexedDB impossible.'));
  }).catch((erreur: unknown) => {
    // Nouvel essai possible au prochain appel (ex. quota libéré).
    base = null;
    throw erreur;
  });
  return base;
}

function executer<T>(mode: IDBTransactionMode, action: (magasin: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return ouvrir().then(
    (db) =>
      new Promise<T>((resoudre, rejeter) => {
        const transaction = db.transaction(MAGASIN, mode);
        const requete = action(transaction.objectStore(MAGASIN));
        transaction.oncomplete = () => resoudre(requete.result);
        transaction.onerror = () => rejeter(transaction.error ?? new Error('Transaction IndexedDB échouée.'));
        transaction.onabort = () => rejeter(transaction.error ?? new Error('Transaction IndexedDB annulée.'));
      }),
  );
}

export function lireValeur<T>(cle: string): Promise<T | undefined> {
  return executer('readonly', (magasin) => magasin.get(cle) as IDBRequest<T | undefined>);
}

export async function ecrireValeur<T>(cle: string, valeur: T): Promise<void> {
  await executer('readwrite', (magasin) => magasin.put(valeur, cle));
}
