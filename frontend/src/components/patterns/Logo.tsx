import { cn } from '@/lib/cn';

/**
 * Symbole StockFlow — centralisé ici pour n'avoir qu'un seul endroit à
 * modifier si le logo change à nouveau, plutôt que de dupliquer la
 * balise <img> dans chaque écran (sidebar, panneau d'authentification,
 * en-tête mobile...).
 */
export function Logo({ taille = 36, className }: { taille?: number; className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt="StockFlow"
      width={taille}
      height={taille}
      className={cn('shrink-0 object-contain', className)}
    />
  );
}
