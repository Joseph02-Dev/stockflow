import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  secondary: 'bg-surface text-text-primary border border-border-subtle hover:bg-background',
  ghost: 'bg-transparent text-text-secondary hover:bg-background',
  danger: 'bg-error text-white hover:opacity-90',
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      // Un bouton en cours de chargement doit être inactivable, pour
      // éviter les doubles soumissions.
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-(--radius-button) px-4 py-2 text-sm font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
