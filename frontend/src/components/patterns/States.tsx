import type { ReactNode } from 'react';
import { Inbox, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/** Forme grise au reflet animé, à la place d'un contenu en chargement. */
export function Squelette({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('squelette block h-3 rounded-sm', className)} />;
}

const LARGEURS = ['w-2/5', 'w-1/3', 'w-1/2', 'w-1/4', 'w-2/5', 'w-1/3'];

function LignesSquelette({ lignes }: { lignes: number }) {
  return (
    <div className="divide-y divide-rule">
      {Array.from({ length: lignes }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Squelette className="h-8 w-8 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Squelette className={cn('h-3', LARGEURS[i % LARGEURS.length])} />
            <Squelette className="h-2.5 w-1/5" />
          </div>
          <Squelette className="hidden h-3 w-16 sm:block" />
          <Squelette className="h-6 w-14 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/**
 * État de chargement d'un bloc : un squelette qui reprend la forme du
 * contenu attendu, pour que la page garde sa structure pendant l'attente.
 * - lignes : listes et tableaux (par défaut) ;
 * - fiche : formulaires et fiches détail ;
 * - cartes : grilles de cartes ;
 * - page : écran détail entier (titre, puis panneau de lignes).
 */
export function LoadingState({
  libelle = 'Chargement…',
  variante = 'lignes',
  lignes = 5,
}: {
  libelle?: string;
  variante?: 'lignes' | 'fiche' | 'cartes' | 'page';
  lignes?: number;
}) {
  return (
    <div role="status" aria-live="polite" className={cn('w-full', variante === 'page' && 'flex flex-col gap-5')}>
      <span className="sr-only">{libelle}</span>
      {variante === 'page' && (
        <>
          <div className="flex flex-col gap-2.5">
            <Squelette className="h-2.5 w-32" />
            <Squelette className="h-6 w-64 max-w-full" />
            <Squelette className="h-3 w-80 max-w-full" />
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule shadow-card lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-surface px-5 py-4">
                <Squelette className="h-2.5 w-20" />
                <Squelette className="mt-3 h-5 w-24" />
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border border-rule bg-surface shadow-card">
            <div className="border-b border-rule px-5 py-4">
              <Squelette className="h-3 w-36" />
            </div>
            <LignesSquelette lignes={lignes} />
          </div>
        </>
      )}
      {variante === 'lignes' && <LignesSquelette lignes={lignes} />}
      {variante === 'fiche' && (
        <div className="flex flex-col gap-5 p-4">
          {Array.from({ length: lignes }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Squelette className="h-2.5 w-24" />
              <Squelette className="h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
      )}
      {variante === 'cartes' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: lignes }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-lg border border-rule bg-surface p-4">
              <Squelette className="h-3 w-1/2" />
              <Squelette className="h-6 w-1/3" />
              <Squelette className="h-2.5 w-2/3" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  titre,
  description,
  action,
}: {
  titre: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Inbox className="size-8 text-steel-400" aria-hidden="true" />
      <p className="text-panneau text-ink-900">{titre}</p>
      {description && <p className="max-w-sm text-corps text-steel-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" role="alert">
      <TriangleAlert className="size-8 text-rupture" aria-hidden="true" />
      <p className="max-w-sm text-corps text-steel-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
