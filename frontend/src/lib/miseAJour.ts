/**
 * Reprise après un déploiement. Chaque version renomme ses fichiers
 * (AccueilPage-<empreinte>.js / .css) : un onglet resté ouvert, ou une
 * ancienne version servie par le cache hors ligne, réclame des fichiers
 * qui n'existent plus et la page chargée à la demande échoue (« Unable to
 * preload CSS », « Failed to fetch dynamically imported module »).
 *
 * Remède recommandé par Vite : recharger la page pour obtenir la version
 * en ligne. Une seule fois par minute : si le rechargement ne suffit pas
 * (réseau coupé…), l'erreur s'affiche normalement au lieu d'une boucle.
 */
const CLE = 'stockflow.rechargement-version';
export const DELAI_ENTRE_RECHARGEMENTS_MS = 60_000;

/** Vrai si aucun rechargement automatique n'a eu lieu dans la dernière minute. */
export function rechargementAutorise(maintenant: number, dernier: number | null): boolean {
  // Valeur absente ou illisible : rien ne doit bloquer la reprise.
  if (dernier === null || !Number.isFinite(dernier)) return true;
  return maintenant - dernier >= DELAI_ENTRE_RECHARGEMENTS_MS;
}

export function installerRepriseApresDeploiement() {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      const valeur = sessionStorage.getItem(CLE);
      const maintenant = Date.now();
      if (!rechargementAutorise(maintenant, valeur ? Number(valeur) : null)) return;
      sessionStorage.setItem(CLE, String(maintenant));
    } catch {
      // Stockage indisponible : sans garde contre les boucles, pas de rechargement automatique.
      return;
    }
    // Empêche l'erreur d'atteindre l'écran d'erreur : la page se recharge.
    event.preventDefault();
    window.location.reload();
  });
}
