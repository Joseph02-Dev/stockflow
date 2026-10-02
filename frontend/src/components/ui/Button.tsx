import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { PointsChargement } from './PointsChargement';
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
      aria-busy={loading || undefined}
      className={boutonClasses(variant, className, { taille, icone })}
      {...props}
    >
      {children}
      {loading && <PointsChargement />}
    </button>
  );
}
