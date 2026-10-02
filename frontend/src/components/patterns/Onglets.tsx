import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * Contrôle segmenté : bascule entre des vues d'un même écran. Segment
 * actif sur l'encre, pour se distinguer des boutons d'action (ultramarine).
 */
export function Onglets<C extends string>({
  onglets,
  actif,
  onChange,
  libelle,
}: {
  onglets: readonly { cle: C; libelle: string; desactive?: boolean; raison?: string }[];
  actif: C;
  onChange: (cle: C) => void;
  libelle: string;
}) {
  const conteneurRef = useRef<HTMLDivElement>(null);

  // Sur écran étroit le contrôle défile horizontalement : on amène le
  // segment actif dans la zone visible (sans faire défiler la page).
  useEffect(() => {
    const conteneur = conteneurRef.current;
    const segment = conteneur?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!conteneur || !segment) return;
    const debordeADroite = segment.offsetLeft + segment.offsetWidth > conteneur.scrollLeft + conteneur.clientWidth;
    if (debordeADroite || segment.offsetLeft < conteneur.scrollLeft) {
      conteneur.scrollLeft = segment.offsetLeft - 8;
    }
  }, [actif]);

  return (
    <div
      ref={conteneurRef}
      className="inline-flex max-w-full self-start overflow-x-auto rounded-md border border-rule bg-surface p-0.5"
      role="tablist"
      aria-label={libelle}
    >
      {onglets.map((onglet) => (
        <button
          key={onglet.cle}
          type="button"
          role="tab"
          aria-selected={actif === onglet.cle}
          onClick={() => onChange(onglet.cle)}
          disabled={onglet.desactive}
          title={onglet.desactive ? onglet.raison : undefined}
          className={cn(
            'h-8 shrink-0 rounded-sm px-3 text-corps font-medium whitespace-nowrap transition-colors',
            actif === onglet.cle ? 'bg-ink-800 text-white' : 'text-steel-500 hover:text-ink-900',
            'disabled:cursor-not-allowed disabled:text-steel-400 disabled:hover:text-steel-400',
          )}
        >
          {onglet.libelle}
        </button>
      ))}
    </div>
  );
}
