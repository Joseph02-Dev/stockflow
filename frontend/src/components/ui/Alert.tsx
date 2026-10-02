import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

type AlertVariant = 'success' | 'warning' | 'error' | 'info';

const config: Record<AlertVariant, { classes: string; Icon: typeof Info }> = {
  success: { classes: 'bg-ok-wash text-ok border-ok/20', Icon: CheckCircle2 },
  warning: { classes: 'bg-faible-wash text-faible border-faible/20', Icon: TriangleAlert },
  error: { classes: 'bg-rupture-wash text-rupture border-rupture/20', Icon: AlertCircle },
  info: { classes: 'bg-action-wash text-action border-action/20', Icon: Info },
};

export function Alert({ variant = 'info', children }: { variant?: AlertVariant; children: ReactNode }) {
  const { classes, Icon } = config[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2 rounded-md border px-3 py-2.5 text-corps', classes)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
