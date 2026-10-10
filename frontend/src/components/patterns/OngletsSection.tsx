import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

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
  return (
    <nav aria-label={libelle} className="mb-5">
      <div className="inline-flex max-w-full overflow-x-auto rounded-md border border-rule bg-surface p-0.5">
        {onglets.map((onglet) => (
          <NavLink
            key={onglet.to}
            to={onglet.to}
            end
            className={({ isActive }) =>
              cn(
                'inline-flex h-8 shrink-0 items-center gap-2 rounded-sm px-3 text-corps font-medium whitespace-nowrap transition-colors',
                isActive ? 'bg-inverse text-sur-inverse' : 'text-steel-500 hover:text-ink-900',
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
