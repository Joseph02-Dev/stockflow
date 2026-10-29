import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNombre } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import type { EtatPagination } from './usePagination';

/**
 * Barre « Précédent / Suivant » sous une liste (usePagination). Absente
 * quand tout tient sur une page. compact : flèches seules (colonne étroite).
 */
export function Pagination({ etat, compact = false, className }: { etat: EtatPagination; compact?: boolean; className?: string }) {
  const libelle = compact ? 'sr-only' : 'max-[380px]:sr-only';
  if (!etat.aPrecedent && !etat.aSuivant) return null;
  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-between gap-3 px-5 py-3', className)}>
      <p className="text-meta text-steel-500" aria-live="polite">
        {formatNombre(etat.debut)}–{formatNombre(etat.fin)} sur {formatNombre(etat.total)}
        {etat.totalPartiel && '+'}
      </p>
      <div className="flex gap-1.5">
        <Button variant="secondary" taille="sm" disabled={!etat.aPrecedent} onClick={etat.precedent}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          <span className={libelle}>Précédent</span>
        </Button>
        <Button variant="secondary" taille="sm" disabled={!etat.aSuivant} loading={etat.chargement} onClick={etat.suivant}>
          <span className={libelle}>Suivant</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
