import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

type AlertVariant = 'success' | 'warning' | 'error' | 'info';

const config: Record<AlertVariant, { classes: string; Icon: typeof Info }> = {
  success: { classes: 'bg-success/10 text-success border-success/30', Icon: CheckCircle2 },
  warning: { classes: 'bg-warning/10 text-warning border-warning/30', Icon: TriangleAlert },
  error: { classes: 'bg-error/10 text-error border-error/30', Icon: AlertCircle },
  info: { classes: 'bg-info/10 text-info border-info/30', Icon: Info },
};

export function Alert({ variant = 'info', children }: { variant?: AlertVariant; children: ReactNode }) {
  const { classes, Icon } = config[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2 rounded-(--radius-card) border p-3 text-sm', classes)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
