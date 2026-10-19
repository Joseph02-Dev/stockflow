import { useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { PASTILLE, PISTE, SEGMENT, useIndicateurGlissant } from './useIndicateurGlissant';

export interface OngletSection {
  to: string;
  libelle: string;
  /** Pastille facultative (ex. nombre d'alertes). */
  compteur?: number;
}

/**
 * Onglets qui relient les pages d'une même section (Alertes / Péremptions,
 * Clients / Créances…) : chaque onglet est une vraie page, avec son adresse,
 * mais le menu n'a qu'une entrée. Même apparence que le contrôle segmenté.
 */
export function OngletsSection({ onglets, libelle }: { onglets: OngletSection[]; libelle: string }) {
  const { pathname } = useLocation();
  const conteneurRef = useRef<HTMLDivElement>(null);
  const pastilleRef = useRef<HTMLSpanElement>(null);
  useIndicateurGlissant(conteneurRef, pastilleRef, '[aria-current="page"]', pathname);
  return (
    <nav aria-label={libelle} className="mb-5">
      <div ref={conteneurRef} className={PISTE}>
        <span ref={pastilleRef} className={PASTILLE} aria-hidden="true" />
        {onglets.map((onglet) => (
          <NavLink
            key={onglet.to}
            to={onglet.to}
            end
            className={({ isActive }) =>
              cn(
                SEGMENT,
                'inline-flex items-center gap-2',
                isActive ? 'font-semibold text-ink-900' : 'font-medium text-steel-500 hover:text-ink-900',
              )
            }
          >
            {onglet.libelle}
            {onglet.compteur ? (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rupture px-1.5 text-meta font-semibold text-sur-couleur">
                {onglet.compteur}
              </span>
            ) : null}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
