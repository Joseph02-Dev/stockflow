import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function PageHeader({
  titre,
  description,
  action,
}: {
  titre: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">{titre}</h1>
        {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-(--radius-card) border border-border-subtle bg-surface shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}
