import { useState } from 'react';
import { cn } from '@/lib/cn';
import { formatCompact, formatNombre } from '@/lib/format';

/**
 * Graphiques de l'écran Statistiques, dessinés sans bibliothèque : SVG pour
 * les courbes, CSS pour les chandeliers et les anneaux. Chacun a sa version
 * tableau pour les lecteurs d'écran (sr-only).
 */

/** Plafond « rond » de l'axe : 1, 2, 2,5 ou 5 × 10ⁿ au-dessus du maximum. */
function plafondRond(max: number): number {
  if (max <= 0) return 1;
  const puissance = 10 ** Math.floor(Math.log10(max));
  const pas = [1, 2, 2.5, 5, 10].find((p) => p * puissance >= max * 1.1) ?? 10;
  return pas * puissance;
}

/** Mini-courbe d'un indicateur (décorative : la valeur et la variation sont écrites à côté). */
export function Sparkline({ valeurs, hausse }: { valeurs: number[]; hausse: boolean }) {
  if (valeurs.length < 2) return null;
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const d = valeurs
    .map(
      (v, i) =>
        `${i ? 'L' : 'M'}${((i / (valeurs.length - 1)) * 120).toFixed(1)} ${(32 - ((v - min) / (max - min || 1)) * 28).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg width="96" height="32" viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true" className="shrink-0">
      <path
        d={d}
        fill="none"
        className={hausse ? 'stroke-ok' : 'stroke-rupture'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export interface PointCourbe {
  court: string;
  long: string;
  valeur: number;
}

/** Courbe de tendance avec curseur : survol (souris) ou flèches (clavier). */
export function CourbeTendance({ points, unite }: { points: PointCourbe[]; unite: string }) {
  const [actif, setActif] = useState<number | null>(null);
  const n = points.length;
  const plafond = plafondRond(Math.max(...points.map((p) => p.valeur)));
  const x = (i: number) => (n === 1 ? 400 : (i / (n - 1)) * 800);
  const y = (v: number) => 240 - (v / plafond) * 230;
  const ligne = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.valeur).toFixed(1)}`).join(' ');
  const i = actif ?? n - 1;
  const gauche = x(i) / 8;
  const pas = Math.max(1, Math.ceil(n / 7));

  function survoler(event: React.MouseEvent<HTMLDivElement>) {
    const zone = event.currentTarget.getBoundingClientRect();
    setActif(Math.min(n - 1, Math.max(0, Math.round(((event.clientX - zone.left) / zone.width) * (n - 1)))));
  }
  function clavier(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') setActif(Math.max(0, i - 1));
    else if (event.key === 'ArrowRight') setActif(Math.min(n - 1, i + 1));
    else return;
    event.preventDefault();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative ml-12 h-60">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <div
            key={f}
            className="absolute inset-x-0 border-t border-dashed border-rule-strong"
            style={{ top: `${100 - (f * 230) / 2.4}%` }}
            aria-hidden="true"
          >
            <span className="absolute right-[calc(100%+8px)] -top-2 font-mono text-[11px] text-steel-500">
              {formatCompact(plafond * f)}
            </span>
          </div>
        ))}
        <svg
          viewBox="0 0 800 240"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden="true"
        >
          <path d={`${ligne} L800 240 L0 240 Z`} className="fill-action/10" />
          <path
            d={ligne}
            fill="none"
            className="stroke-action"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className="pointer-events-none absolute inset-y-0 border-l border-steel-500"
          style={{ left: `${gauche}%` }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -mt-[5px] -ml-[5px] size-2.5 rounded-full bg-action ring-2 ring-surface"
          style={{ left: `${gauche}%`, top: `${y(points[i].valeur) / 2.4}%` }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute top-2 rounded-md bg-ink-900 px-2.5 py-1.5 text-meta whitespace-nowrap text-paper"
          style={gauche > 70 ? { right: `calc(${100 - gauche}% + 12px)` } : { left: `calc(${gauche}% + 12px)` }}
          aria-live="polite"
        >
          <div className="font-semibold">{points[i].long}</div>
          <div className="font-mono">
            {formatNombre(points[i].valeur)} {unite}
          </div>
        </div>
        <div
          className="absolute inset-0 cursor-crosshair rounded-sm focus-visible:outline-2 focus-visible:outline-action"
          onMouseMove={survoler}
          onKeyDown={clavier}
          tabIndex={0}
          role="slider"
          aria-label="Parcourir la courbe"
          aria-valuemin={0}
          aria-valuemax={n - 1}
          aria-valuenow={i}
          aria-valuetext={`${points[i].long} : ${formatNombre(points[i].valeur)} ${unite}`}
        />
      </div>
      <div className="ml-12 flex justify-between font-mono text-[11px] text-steel-500" aria-hidden="true">
        {points.map((p, index) => (
          <span
            key={p.long}
            className={cn(
              'w-0 text-center whitespace-nowrap',
              index % pas !== 0 && index !== n - 1 && 'invisible',
              (index / pas) % 2 === 1 && 'max-sm:invisible',
            )}
          >
            <span className="inline-block -translate-x-1/2">{p.court}</span>
          </span>
        ))}
      </div>
      <TableauAccessible
        legende="Chiffre d'affaires par période"
        colonnes={['Période', `Montant (${unite})`]}
        lignes={points.map((p) => [p.long, formatNombre(p.valeur)])}
      />
    </div>
  );
}

export interface Bougie {
  court: string;
  long: string;
  ouverture: number;
  haut: number;
  bas: number;
  cloture: number;
}

/**
 * Chandeliers du niveau de stock. Hausse (réapprovisionnement) : corps
 * creux bleu ; baisse : corps plein orange. La forme double la couleur.
 */
export function Chandeliers({
  bougies,
  unite,
  onSurvol,
}: {
  bougies: Bougie[];
  unite: string;
  onSurvol: (index: number) => void;
}) {
  // Plancher à 0, sauf niveau reconstitué négatif (historique incomplet) : l'axe le montre.
  // Quatre graduations rondes couvrant [plancher, plus haut].
  const minimum = Math.min(0, ...bougies.map((b) => b.bas));
  const pas = plafondRond(Math.max(1, ...bougies.map((b) => b.haut)) - minimum) / 4;
  const plancher = Math.floor(minimum / pas) * pas;
  const plafond = Math.max(plancher + 4 * pas, Math.ceil(Math.max(...bougies.map((b) => b.haut)) / pas) * pas);
  const y = (v: number) => 100 - ((v - plancher) / (plafond - plancher)) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative ml-10 h-60">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <div
            key={f}
            className="absolute inset-x-0 border-t border-dashed border-rule-strong"
            style={{ top: `${100 - f * 100}%` }}
            aria-hidden="true"
          >
            <span className="absolute right-[calc(100%+8px)] -top-2 font-mono text-[11px] text-steel-500">
              {formatCompact(plancher + (plafond - plancher) * f)}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex gap-1" aria-hidden="true">
          {bougies.map((b, index) => {
            const hausse = b.cloture >= b.ouverture;
            const haut = Math.max(b.ouverture, b.cloture);
            const bas = Math.min(b.ouverture, b.cloture);
            return (
              <div
                key={b.long}
                className="relative flex-1 rounded-md hover:bg-action-wash"
                onMouseEnter={() => onSurvol(index)}
              >
                <span
                  className={cn('absolute left-1/2 -ml-px w-0.5', hausse ? 'bg-action' : 'bg-serie-2')}
                  style={{
                    top: `${y(b.haut)}%`,
                    height: `${y(b.bas) - y(b.haut)}%`,
                  }}
                />
                <span
                  className={cn(
                    'absolute inset-x-[22%] box-border rounded-[3px]',
                    hausse ? 'border-2 border-action bg-surface' : 'bg-serie-2',
                  )}
                  style={{
                    top: `${y(haut)}%`,
                    height: `max(3px, ${y(bas) - y(haut)}%)`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="ml-10 flex gap-1 font-mono text-[11px] text-steel-500" aria-hidden="true">
        {bougies.map((b, index) => (
          <span key={b.long} className={cn('flex-1 text-center', index % 2 === 1 && 'max-sm:invisible')}>
            {b.court}
          </span>
        ))}
      </div>
      <TableauAccessible
        legende={`Niveau de stock par semaine (${unite})`}
        colonnes={['Semaine', 'Ouverture', 'Plus haut', 'Plus bas', 'Clôture']}
        lignes={bougies.map((b) => [b.long, b.ouverture, b.haut, b.bas, b.cloture].map(String))}
      />
    </div>
  );
}

export interface PartAnneau {
  libelle: string;
  valeur: number;
  /** Classe de fond Tailwind de la part (pastille et anneau). */
  couleur: string;
  /** Variable CSS de la couleur, pour le dégradé conique. */
  variable: string;
}

/** Anneau de répartition (conic-gradient), séparé par de fins traits de fond, avec légende chiffrée. */
export function Anneau({
  titre,
  parts,
  total,
  uniteTotal,
  formatPart,
}: {
  titre: string;
  parts: PartAnneau[];
  total: string;
  uniteTotal: string;
  formatPart: (part: PartAnneau, pourcent: number) => string;
}) {
  const somme = parts.reduce((t, p) => t + p.valeur, 0);
  let angle = 0;
  const arrets = parts.flatMap((p) => {
    const fin = angle + (p.valeur / somme) * 360;
    const segment = [
      `var(${p.variable}) ${angle + 1}deg ${fin - 1}deg`,
      `var(--color-surface) ${fin - 1}deg ${fin}deg`,
    ];
    angle = fin;
    return segment;
  });
  const pourcent = (v: number) => Math.round((v / somme) * 100);

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div
        className="relative size-[152px] shrink-0 rounded-full"
        style={{
          background:
            somme > 0 ? `conic-gradient(var(--color-surface) 0deg 1deg, ${arrets.join(', ')})` : 'var(--color-rule)',
        }}
        role="img"
        aria-label={`${titre} : ${parts.map((p) => `${p.libelle} ${pourcent(p.valeur)} %`).join(', ')}`}
      >
        <div className="absolute inset-[26px] flex flex-col items-center justify-center rounded-full bg-surface text-center">
          <span className="font-mono text-[17px] font-medium text-ink-900">{total}</span>
          <span className="text-[11px] text-steel-500">{uniteTotal}</span>
        </div>
      </div>
      <ul className="flex min-w-0 grow basis-[190px] flex-col gap-2">
        {parts.map((p) => (
          <li key={p.libelle} className="grid grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-2 text-meta">
            <span className={cn('size-2.5 rounded-[3px]', p.couleur)} aria-hidden="true" />
            <span className="truncate text-ink-900">{p.libelle}</span>
            <span className="font-mono text-steel-700">{formatPart(p, pourcent(p.valeur))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TableauAccessible({ legende, colonnes, lignes }: { legende: string; colonnes: string[]; lignes: string[][] }) {
  return (
    <table className="sr-only">
      <caption>{legende}</caption>
      <thead>
        <tr>
          {colonnes.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lignes.map((l) => (
          <tr key={l[0]}>
            {l.map((cellule, i) => (
              <td key={i}>{cellule}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
