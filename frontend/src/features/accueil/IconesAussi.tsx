import { useEffect, useRef, type ComponentType, type CSSProperties, type ReactNode } from 'react';

/**
 * Pictogrammes animés de la section « Et aussi ». Les tracés reprennent ceux
 * de lucide (24 × 24, trait de 2) ; chaque icône joue une courte boucle avec
 * de longues pauses, uniquement quand la carte est à l'écran. Sous
 * prefers-reduced-motion, seule une version douce est jouée (tracés et
 * fondus, sans déplacement) : voir accueil.css, préfixe `ia-`.
 */

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6 overflow-visible"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconeCatalogue() {
  return (
    <Svg>
      <g className="ia-sautille">
        <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
        <path d="M12 22V12" />
        <polyline points="3.29 7 12 12 20.71 7" />
        <path d="m7.5 4.27 9 5.15" />
      </g>
      <path className="ia-scan" d="M1 12h22" strokeWidth={1.5} />
    </Svg>
  );
}

export function IconeFournisseurs() {
  return (
    <Svg>
      <g className="ia-roule">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18H9" />
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
        <circle cx="17" cy="18" r="2" />
        <circle cx="7" cy="18" r="2" />
      </g>
    </Svg>
  );
}

export function IconeInventaires() {
  return (
    <Svg>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path className="ia-trace" pathLength={1} d="m9 14 2 2 4-4" />
    </Svg>
  );
}

export function IconePertes() {
  return (
    <Svg>
      <g className="ia-secoue">
        <path d="M12 22V12" />
        <path d="M21 10.5V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l.13-.074" />
        <path d="M3.29 7 12 12l8.71-5" />
        <path d="m7.5 4.27 8.997 5.148" />
      </g>
      <path className="ia-trace" pathLength={1} d="m16.5 14.5 5 5" />
      <path className="ia-trace ia-trace-2" pathLength={1} d="m16.5 19.5 5-5" />
    </Svg>
  );
}

export function IconeEquipe() {
  return (
    <Svg>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <g className="ia-arrive">
        <path d="M16 3.128a4 4 0 0 1 0 7.744" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </g>
    </Svg>
  );
}

export function IconeRapports() {
  return (
    <Svg>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path className="ia-trace" pathLength={1} d="M10 9H8" />
      <path className="ia-trace ia-trace-2" pathLength={1} d="M16 13H8" />
      <path className="ia-trace ia-trace-3" pathLength={1} d="M16 17H8" />
    </Svg>
  );
}

/**
 * Tuile qui ne lance l'animation de son icône (attribut data-actif) que
 * lorsqu'elle est visible ; `decalage` décale les cartes voisines.
 */
export function TuileAnimee({ Icone, decalage }: { Icone: ComponentType; decalage: number }) {
  const racine = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = racine.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observateur = new IntersectionObserver(([entree]) => {
      element.toggleAttribute('data-actif', entree.isIntersecting);
    });
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  return (
    <span
      ref={racine}
      className="tuile-animee flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-paper text-action ring-1 ring-rule"
      style={{ '--decalage': `${decalage}ms` } as CSSProperties}
    >
      <Icone />
    </span>
  );
}
