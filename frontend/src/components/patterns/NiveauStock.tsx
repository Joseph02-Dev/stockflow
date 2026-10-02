import { cn } from '@/lib/cn';
import { statutStock } from './statutStock';

const couleurChiffre = { rupture: 'text-rupture', faible: 'text-faible', ok: 'text-ink-900' } as const;
const couleurBarre = { rupture: 'bg-rupture', faible: 'bg-faible', ok: 'bg-ok' } as const;

/**
 * Niveau de stock d'un produit : chiffre coloré selon le statut, rappel
 * du seuil et barre de progression. La barre couvre 0 → 2 × seuil, le
 * repère central matérialise le seuil : on voit d'un coup d'œil de
 * combien on est en dessous (ou au-dessus).
 *
 * La couleur n'est jamais seule : le chiffre et le seuil sont toujours
 * écrits, et les écrans qui l'utilisent l'accompagnent d'une pastille
 * de statut libellée.
 */
export function NiveauStock({
  quantite,
  seuil,
  unite,
  className,
}: {
  quantite: number;
  seuil: number;
  unite?: string | null;
  className?: string;
}) {
  const statut = statutStock(quantite, seuil);
  const echelle = Math.max(seuil * 2, quantite, 1);
  const largeur = Math.min(100, (quantite / echelle) * 100);

  return (
    <div className={cn('flex min-w-[112px] flex-col gap-1.5', className)}>
      <p className="flex items-baseline gap-1 whitespace-nowrap">
        <span className={cn('text-[15px] leading-5 font-semibold', couleurChiffre[statut])}>{quantite}</span>
        {unite && <span className="text-meta text-steel-400">{unite}</span>}
        <span className="text-meta text-steel-500">/ seuil {seuil}</span>
      </p>
      <div className="relative h-1 w-full rounded-full bg-rule" aria-hidden="true">
        <div className={cn('h-full rounded-full', couleurBarre[statut])} style={{ width: `${largeur}%` }} />
        {seuil > 0 && (
          <span
            className="absolute -top-0.5 h-2 w-px bg-steel-400"
            style={{ left: `${(seuil / echelle) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
