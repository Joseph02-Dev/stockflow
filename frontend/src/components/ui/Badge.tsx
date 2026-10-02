import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type VarianteBadge = 'rupture' | 'faible' | 'ok' | 'neutral' | 'action' | 'accent';

const badgeClasses: Record<VarianteBadge, string> = {
  rupture: 'bg-rupture-wash text-rupture',
  faible: 'bg-faible-wash text-faible',
  ok: 'bg-ok-wash text-ok',
  neutral: 'bg-paper text-steel-700',
  action: 'bg-action-wash text-action',
  accent: 'bg-accent-wash text-accent',
};

/**
 * Pastille de statut. Le statut n'est jamais porté par la couleur seule :
 * le libellé textuel est toujours présent (règle d'accessibilité du
 * Design System). Elle ne se coupe jamais sur deux lignes.
 */
export function Badge({
  variant = 'neutral',
  icone,
  children,
}: {
  variant?: VarianteBadge;
  icone?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-meta font-medium whitespace-nowrap',
        badgeClasses[variant],
      )}
    >
      {icone}
      {children}
    </span>
  );
}
