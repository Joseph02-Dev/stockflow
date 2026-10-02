import { useState } from 'react';
import { cn } from '@/lib/cn';
import { formatNombre, pluriel } from '@/lib/format';

export interface Segment {
  cle: string;
  libelle: string;
  valeur: number;
  /** Variable CSS de la couleur — catégorielle validée, ou neutre pour « autres ». */
  couleur: string;
}

const RAYON = 70;
const EPAISSEUR = 22;
const CIRCONFERENCE = 2 * Math.PI * RAYON;
/** Espace de 2 px (en longueur d'arc) entre deux segments, couleur de surface. */
const ESPACE = 2;

/**
 * Anneau des mouvements par entreprise : total au centre, légende chiffrée
 * à droite. L'identité n'est jamais portée par la couleur seule — chaque
 * segment a son libellé et sa valeur dans la légende, qui sert aussi de
 * vue tabulaire. Survol d'un segment ou d'une ligne : les deux s'allument.
 */
export function AnneauMouvements({ segments, total }: { segments: Segment[]; total: number }) {
  const [survol, setSurvol] = useState<string | null>(null);
  let cumul = 0;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <svg
          viewBox="0 0 180 180"
          className="size-[180px] -rotate-90"
          role="img"
          aria-label={`Mouvements des 30 derniers jours : ${formatNombre(total)} au total, répartis par entreprise.`}
        >
          <circle cx="90" cy="90" r={RAYON} fill="none" stroke="var(--color-paper)" strokeWidth={EPAISSEUR} />
          {total > 0 &&
            segments.map((s) => {
              const longueur = (s.valeur / total) * CIRCONFERENCE;
              const trace = Math.max(longueur - (segments.length > 1 ? ESPACE : 0), 0.5);
              const decalage = -cumul;
              cumul += longueur;
              return (
                <circle
                  key={s.cle}
                  cx="90"
                  cy="90"
                  r={RAYON}
                  fill="none"
                  stroke={s.couleur}
                  strokeWidth={survol === s.cle ? EPAISSEUR + 4 : EPAISSEUR}
                  strokeDasharray={`${trace} ${CIRCONFERENCE - trace}`}
                  strokeDashoffset={decalage}
                  opacity={survol && survol !== s.cle ? 0.35 : 1}
                  className="cursor-default transition-[opacity,stroke-width]"
                  onMouseEnter={() => setSurvol(s.cle)}
                  onMouseLeave={() => setSurvol(null)}
                >
                  <title>{`${s.libelle} : ${formatNombre(s.valeur)} mouvements (${Math.round((s.valeur / total) * 100)} %)`}</title>
                </circle>
              );
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-chiffre text-ink-900">{formatNombre(total)}</span>
          <span className="text-meta text-steel-500">{pluriel('mouvement', total)}</span>
        </div>
      </div>

      <ul className="flex w-full min-w-0 flex-1 flex-col gap-1">
        {segments.map((s) => (
          <li
            key={s.cle}
            onMouseEnter={() => setSurvol(s.cle)}
            onMouseLeave={() => setSurvol(null)}
            className={cn(
              'grid grid-cols-[10px_minmax(0,1fr)_auto_44px] items-center gap-2.5 rounded-sm px-2 py-1.5 text-corps',
              survol === s.cle && 'bg-paper',
            )}
          >
            <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: s.couleur }} aria-hidden="true" />
            <span className="truncate text-ink-900">{s.libelle}</span>
            <span className="font-semibold text-ink-900">{formatNombre(s.valeur)}</span>
            <span className="text-right text-meta text-steel-500">
              {total > 0 ? Math.round((s.valeur / total) * 100) : 0} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
