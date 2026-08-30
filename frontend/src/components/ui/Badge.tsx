import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type BadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info';

const badgeClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-background text-text-secondary border-border-subtle',
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  error: 'bg-error/10 text-error border-error/30',
  info: 'bg-info/10 text-info border-info/30',
};

/**
 * Le statut n'est jamais porté par la couleur seule : le libellé textuel
 * est toujours présent (règle d'accessibilité du Design System).
 */
export function Badge({ variant = 'neutral', children }: { variant?: BadgeVariant; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        badgeClasses[variant],
      )}
    >
      {children}
    </span>
  );
}
