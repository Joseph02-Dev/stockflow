/**
 * Connectivité réelle au serveur, et non simple présence d'une interface
 * réseau.
 *
 * navigator.onLine reste à `true` sur un Wi-Fi sans accès Internet, une
 * box coupée ou un poste équipé d'un adaptateur virtuel (VPN, machine
 * virtuelle) : l'application s'affichait alors « En ligne » et ne
 * synchronisait jamais. On le complète donc par une sonde légère vers
 * l'API :
 * - requête HEAD (jamais mise en cache par le service worker, qui ne
 *   sert que les GET) : n'importe quelle réponse HTTP prouve que le
 *   serveur est joignable, seule une erreur réseau signifie hors ligne ;
 * - déclenchée au démarrage, aux événements online/offline, au retour
 *   sur l'onglet, après toute erreur réseau d'une requête de l'appli, puis
 *   périodiquement (plus souvent hors ligne, pour détecter vite le retour).
 */

const URL_SONDE = `${import.meta.env.VITE_API_URL ?? '/api'}/`;
const DELAI_SONDE_MS = 5000;
const INTERVALLE_EN_LIGNE_MS = 15000;
const INTERVALLE_HORS_LIGNE_MS = 5000;

let joignable = typeof navigator === 'undefined' ? true : navigator.onLine;
let verificationEnCours: Promise<boolean> | null = null;
let minuterie: ReturnType<typeof setTimeout> | null = null;
const abonnes = new Set<() => void>();

function definir(etat: boolean) {
  if (etat === joignable) return;
  joignable = etat;
  abonnes.forEach((notifier) => notifier());
}

async function sonder(): Promise<boolean> {
  if (!navigator.onLine) return false;
  const controleur = new AbortController();
  const delai = setTimeout(() => controleur.abort(), DELAI_SONDE_MS);
  try {
    await fetch(URL_SONDE, { method: 'HEAD', cache: 'no-store', signal: controleur.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(delai);
  }
}

function planifier() {
  if (minuterie) clearTimeout(minuterie);
  if (abonnes.size === 0) {
    minuterie = null;
    return;
  }
  // Onglet en arrière-plan : on ne sonde pas (chaque sonde compte dans
  // la limite de débit par IP) ; le retour sur l'onglet en relance une.
  minuterie = setTimeout(
    () => (document.hidden ? planifier() : void verifierConnexion()),
    joignable ? INTERVALLE_EN_LIGNE_MS : INTERVALLE_HORS_LIGNE_MS,
  );
}

/** Sonde le serveur maintenant (les appels simultanés partagent la même sonde). */
export function verifierConnexion(): Promise<boolean> {
  verificationEnCours ??= sonder()
    .then((etat) => {
      definir(etat);
      return etat;
    })
    .finally(() => {
      verificationEnCours = null;
      planifier();
    });
  return verificationEnCours;
}

/**
 * Une requête de l'application n'a reçu aucune réponse : on passe hors
 * ligne tout de suite, et on sonde de nouveau sans attendre
 * l'échéance pour détecter le retour du réseau au plus vite.
 */
export function signalerEchecReseau(): void {
  definir(false);
  planifier();
}

export function estJoignable(): boolean {
  return joignable;
}

function surHorsLigne() {
  definir(false);
  planifier();
}

function surRetourVisible() {
  if (document.visibilityState === 'visible') void verifierConnexion();
}

function surEnLigne() {
  void verifierConnexion();
}

/** Abonnement au format useSyncExternalStore. */
export function souscrireConnectivite(callback: () => void): () => void {
  const premier = abonnes.size === 0;
  abonnes.add(callback);
  if (premier) {
    window.addEventListener('online', surEnLigne);
    window.addEventListener('offline', surHorsLigne);
    document.addEventListener('visibilitychange', surRetourVisible);
    void verifierConnexion();
  }
  return () => {
    abonnes.delete(callback);
    if (abonnes.size > 0) return;
    window.removeEventListener('online', surEnLigne);
    window.removeEventListener('offline', surHorsLigne);
    document.removeEventListener('visibilitychange', surRetourVisible);
    planifier();
  };
}
