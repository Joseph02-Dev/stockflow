import type { ReactNode } from 'react';
import { Inbox, Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function LoadingState({ libelle = 'Chargement…' }: { libelle?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-text-secondary" role="status">
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
      <Inbox className="size-8 text-text-secondary" aria-hidden="true" />
      <p className="font-medium text-text-primary">{titre}</p>
      {description && <p className="max-w-sm text-sm text-text-secondary">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" role="alert">
      <TriangleAlert className="size-8 text-error" aria-hidden="true" />
      <p className="max-w-sm text-sm text-text-secondary">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
