import type { ReactNode } from 'react';
import { Inbox, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function LoadingState({ libelle = 'Chargement…' }: { libelle?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-corps text-steel-500" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {libelle}
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
