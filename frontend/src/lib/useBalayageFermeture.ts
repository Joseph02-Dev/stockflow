import { useRef, useState } from 'react';
import type { TouchEvent } from 'react';

/** Distance de balayage vers le bas au-delà de laquelle la feuille se ferme. */
const SEUIL_PX = 80;

/**
 * Fermeture d'une feuille montante par balayage vers le bas, depuis sa
 * poignée ou son en-tête : la feuille suit le doigt, puis se ferme ou
 * revient en place.
 */
export function useBalayageFermeture(onFermer: () => void) {
  const depart = useRef<number | null>(null);
  const [decalage, setDecalage] = useState(0);

  return {
    style: decalage > 0 ? { transform: `translateY(${decalage}px)`, transition: 'none' } : undefined,
    poignee: {
      onTouchStart: (e: TouchEvent) => {
        depart.current = e.touches[0].clientY;
      },
      onTouchMove: (e: TouchEvent) => {
        if (depart.current === null) return;
        setDecalage(Math.max(0, e.touches[0].clientY - depart.current));
      },
      onTouchEnd: () => {
        const ferme = decalage > SEUIL_PX;
        depart.current = null;
        setDecalage(0);
        if (ferme) onFermer();
      },
    },
  };
}
