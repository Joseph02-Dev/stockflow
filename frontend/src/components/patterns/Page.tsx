import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function PageHeader({
  titre,
  description,
  action,
}: {
  titre: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-titre text-ink-900">{titre}</h1>
        {description && <p className="mt-1 text-corps text-steel-500">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * Surface posée : bordure, rayon lg et ombre « card ». C'est le seul
 * niveau d'élévation des blocs de contenu — l'ombre « pop » est réservée
 * à ce qui flotte (modales, menus).
 */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-rule bg-surface shadow-card', className)}>
      {children}
    </div>
  );
}

/** En-tête de panneau : titre à 14.5px, méta facultative, action à droite. */
export function PanneauEntete({
  titre,
  meta,
  action,
  className,
}: {
  titre: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 border-b border-rule px-5 py-3.5', className)}>
      <div className="min-w-0">
        <h2 className="text-panneau text-ink-900">{titre}</h2>
        {meta && <p className="mt-0.5 text-meta text-steel-500">{meta}</p>}
      </div>
      {action}
    </div>
  );
}
