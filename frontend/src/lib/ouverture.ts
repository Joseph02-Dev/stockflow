/** Durée minimale de l'écran d'ouverture, depuis le début du chargement : le temps de l'animation. */
const DUREE_MIN_MS = 1600;
const DUREE_MIN_REDUITE_MS = 500;
const DUREE_FONDU_MS = 350;

/**
 * Retire l'écran d'ouverture (index.html) une fois l'application rendue et
 * l'animation jouée. Si le chargement a déjà pris plus longtemps, il part
 * aussitôt ; un toucher le fait partir tout de suite.
 */
export function terminerOuverture(): void {
  const racine = document.documentElement;
  const ecran = document.getElementById('ouverture');
  if (!ecran) return;
  if (!racine.classList.contains('ouverture')) {
    ecran.remove();
    return;
  }
  const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reste = Math.max(0, (reduit ? DUREE_MIN_REDUITE_MS : DUREE_MIN_MS) - performance.now());
  let ferme = false;
  const fermer = () => {
    if (ferme) return;
    ferme = true;
    racine.classList.add('ouverture-fin');
    window.setTimeout(() => {
      ecran.remove();
      racine.classList.remove('ouverture', 'ouverture-fin');
    }, DUREE_FONDU_MS);
  };
  window.setTimeout(fermer, reste);
  ecran.addEventListener('click', fermer, { once: true });
}
