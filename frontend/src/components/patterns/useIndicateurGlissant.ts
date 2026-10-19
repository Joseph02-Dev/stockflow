import { useLayoutEffect, type RefObject } from 'react';

/**
 * Pastille qui glisse sous l'élément actif d'un groupe (onglets, contrôle
 * segmenté). La position est écrite directement sur l'élément : aucun
 * rendu React en plus. La transition n'est activée qu'après le premier
 * placement (data-pret), pour que la pastille n'arrive pas en glissant.
 */
export function useIndicateurGlissant(
  conteneurRef: RefObject<HTMLElement | null>,
  indicateurRef: RefObject<HTMLElement | null>,
  selecteurActif: string,
  cle: unknown,
  axe: 'x' | 'y' = 'x',
) {
  useLayoutEffect(() => {
    const conteneur = conteneurRef.current;
    const indicateur = indicateurRef.current;
    if (!conteneur || !indicateur) return;
    const placer = () => {
      const actif = conteneur.querySelector<HTMLElement>(selecteurActif);
      indicateur.style.opacity = actif ? '1' : '0';
      if (!actif) return;
      if (axe === 'x') {
        indicateur.style.width = `${actif.offsetWidth}px`;
        indicateur.style.transform = `translateX(${actif.offsetLeft}px)`;
      } else {
        indicateur.style.height = `${actif.offsetHeight}px`;
        indicateur.style.transform = `translateY(${actif.offsetTop}px)`;
      }
    };
    placer();
    const image = requestAnimationFrame(() => indicateur.setAttribute('data-pret', ''));
    const taille = new ResizeObserver(placer);
    taille.observe(conteneur);
    // Entrées ajoutées ou retirées (modules chargés), ou entrée active changée.
    const contenu = new MutationObserver(placer);
    contenu.observe(conteneur, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-current', 'aria-selected'],
    });
    return () => {
      cancelAnimationFrame(image);
      taille.disconnect();
      contenu.disconnect();
    };
  }, [conteneurRef, indicateurRef, selecteurActif, cle, axe]);
}

/** Classes communes : piste, pastille, segment. */
export const PISTE = 'relative inline-flex max-w-full overflow-x-auto rounded-md border border-rule bg-paper p-0.5';
export const PASTILLE =
  'pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-sm bg-surface shadow-card ring-1 ring-rule data-[pret]:transition-[transform,width] data-[pret]:duration-300 data-[pret]:ease-sortie motion-reduce:transition-none';
export const SEGMENT =
  'relative z-10 h-8 shrink-0 rounded-sm px-3 text-corps whitespace-nowrap transition-colors duration-150';
