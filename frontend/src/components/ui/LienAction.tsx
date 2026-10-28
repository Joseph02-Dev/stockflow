import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { lienActionClasses } from './lienActionClasses';

/** Flèche du lien d'action, à placer après le libellé d'un <a> ou d'un <button> stylé par lienActionClasses. */
export function FlecheLien({ icone }: { icone?: ReactNode }) {
  return (
    <span aria-hidden="true" className="inline-flex transition-transform duration-150 ease-sortie group-hover/lien:translate-x-0.5 motion-reduce:transform-none">
      {icone ?? <ArrowRight className="size-4" />}
    </span>
  );
}

export function LienAction({ className, children, icone, ...props }: LinkProps & { icone?: ReactNode }) {
  return (
    <Link className={lienActionClasses(className)} {...props}>
      {children}
      <FlecheLien icone={icone} />
    </Link>
  );
}
