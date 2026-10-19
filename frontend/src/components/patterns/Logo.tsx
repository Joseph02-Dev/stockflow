import { cn } from '@/lib/cn';

/** Caisses du symbole « Les piles » (grille de 64) : la dernière, en haut à droite, est en cuivre. */
const CAISSES = [
  [7, 43],
  [25, 43],
  [43, 43],
  [25, 25],
  [43, 25],
] as const;

/**
 * Symbole NimbaFlow — des caisses empilées en escalier : le stock et sa
 * croissance. Centralisé ici pour n'avoir qu'un seul endroit à modifier.
 * Les caisses prennent la couleur du texte environnant (encre sur fond
 * clair, blanc sur la barre latérale) ; la caisse du sommet reste cuivre.
 */
export function Logo({ taille = 36, className }: { taille?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={taille}
      height={taille}
      role="img"
      aria-label="NimbaFlow"
      className={cn('shrink-0', className)}
    >
      {CAISSES.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="14" height="14" rx="3" fill="currentColor" />
      ))}
      <rect x="43" y="7" width="14" height="14" rx="3" className="fill-action" />
    </svg>
  );
}
