import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { PASTILLE, PISTE, SEGMENT, useIndicateurGlissant } from './useIndicateurGlissant';

/**
 * Contrôle segmenté : bascule entre des vues d'un même écran. Une pastille
 * claire glisse sous le segment actif ; le cuivre reste aux boutons d'action.
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
  const pastilleRef = useRef<HTMLSpanElement>(null);
  useIndicateurGlissant(conteneurRef, pastilleRef, '[aria-selected="true"]', actif);

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
      className={cn(PISTE, 'self-start')}
      role="tablist"
      aria-label={libelle}
    >
      <span ref={pastilleRef} className={PASTILLE} aria-hidden="true" />
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
            SEGMENT,
            'retour-appui',
            actif === onglet.cle ? 'font-semibold text-ink-900' : 'font-medium text-steel-500 hover:text-ink-900',
            'disabled:cursor-not-allowed disabled:text-steel-400 disabled:hover:text-steel-400',
          )}
        >
          {onglet.libelle}
        </button>
      ))}
    </div>
  );
}
