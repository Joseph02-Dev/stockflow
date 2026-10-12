import { useEffect, type RefObject } from 'react';

/**
 * Apparition au défilement des éléments marqués `data-apparition` dans la
 * racine. Seuls les éléments encore sous la ligne de flottaison sont masqués,
 * puis révélés une fois en entrant à l'écran : rien ne clignote au
 * chargement, et sans JavaScript ni IntersectionObserver tout reste
 * visible. Rien ne se passe sous prefers-reduced-motion.
 */
export function useApparitionAuDefilement(racine: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = racine.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) {
          if (!entree.isIntersecting) continue;
          entree.target.setAttribute('data-etat', 'visible');
          observateur.unobserve(entree.target);
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.06 },
    );
    const ligneDeFlottaison = window.innerHeight * 0.94;
    for (const cible of element.querySelectorAll<HTMLElement>('[data-apparition]')) {
      if (cible.getBoundingClientRect().top < ligneDeFlottaison) continue;
      cible.dataset.etat = 'cache';
      observateur.observe(cible);
    }
    return () => observateur.disconnect();
  }, [racine]);
}
