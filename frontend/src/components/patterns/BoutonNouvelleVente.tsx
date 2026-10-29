import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { IconeVente } from '@/components/icones/IconeVente';

const TAILLES = {
  sm: 'size-8 [&_svg]:size-[18px]',
  md: 'size-10 [&_svg]:size-[22px]',
  lg: 'size-[52px] rounded-full [&_svg]:size-[26px]',
} as const;

/** Accès à la nouvelle vente : chariot animé, sans texte (libellé pour les lecteurs d'écran et au survol). */
export function BoutonNouvelleVente({
  taille = 'md',
  className,
  ...props
}: { taille?: keyof typeof TAILLES } & Omit<ComponentProps<typeof Link>, 'to'>) {
  return (
    <Link
      to="/ventes/nouvelle"
      aria-label="Nouvelle vente"
      title="Nouvelle vente"
      className={cn('bouton-vente', TAILLES[taille], className)}
      {...props}
    >
      <IconeVente />
    </Link>
  );
}
