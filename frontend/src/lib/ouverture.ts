/** Après l'animation, le logo et le nom restent un instant à l'écran. */
const POSE_MS = 350;
/** Mouvements réduits : pas d'animation, l'écran reste ce temps-là. */
const DUREE_REDUITE_MS = 500;
/** Filet de sécurité : l'écran ne bloque jamais l'application plus longtemps. */
const DUREE_MAX_MS = 4000;
const DUREE_FONDU_MS = 350;

/**
 * Retire l'écran d'ouverture (index.html) une fois l'application rendue et
 * l'animation jouée en entier : on attend la fin réelle des animations, quel
 * que soit le temps de chargement (un chargement lent ne la coupe plus). Si
 * elles sont déjà finies, l'écran part après la pose ; un toucher le fait
 * partir tout de suite.
 */
export function terminerOuverture(): void {
  const racine = document.documentElement;
  const ecran = document.getElementById('ouverture');
  if (!ecran) return;
  if (!racine.classList.contains('ouverture')) {
    ecran.remove();
    return;
  }
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
  ecran.addEventListener('click', fermer, { once: true });
  window.setTimeout(fermer, DUREE_MAX_MS);

  const animations = typeof ecran.getAnimations === 'function' ? ecran.getAnimations({ subtree: true }) : [];
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || animations.length === 0) {
    window.setTimeout(fermer, DUREE_REDUITE_MS);
    return;
  }
  void Promise.allSettled(animations.map((a) => a.finished)).then(() => window.setTimeout(fermer, POSE_MS));
}
