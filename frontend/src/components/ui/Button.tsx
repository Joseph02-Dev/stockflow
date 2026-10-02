import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { boutonClasses } from './boutonClasses';
import type { FormeBouton, VarianteBouton } from './boutonClasses';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, FormeBouton {
  variant?: VarianteBouton;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  taille,
  icone,
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
      className={boutonClasses(variant, className, { taille, icone })}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
