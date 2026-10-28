import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNombre, pluriel } from '@/lib/format';
import { Compteur } from '@/components/patterns/Compteur';
import { Squelette } from '@/components/patterns/States';
import { FlecheLien } from '@/components/ui/LienAction';
import { lienActionClasses } from '@/components/ui/lienActionClasses';

/**
 * Carte « Ventes d'aujourd'hui » : chiffre du jour, écart avec la veille et
 * barres des 7 derniers jours (aujourd'hui en cuivre). Même requête, donc
 * même cache, que les écrans Statistiques et Ventes. Styles dans dashboard.css.
 */

interface Resume7Jours {
  tendance: { debut: string; montant: number; ventes: number }[];
  chiffreAffaires: { valeur: number | null; precedent: number | null };
  ventes: { valeur: number | null; precedent: number | null };
  panierMoyen: { valeur: number | null; precedent: number | null };
}

const jourCourt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' });
const jourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** 2 450 000 → « 2,45 M », 960 000 → « 960 k ». */
function montantCourt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} k`;
  return formatNombre(n);
}

function Gnf() {
  return <span className="text-meta font-medium text-steel-400">GNF</span>;
}

export function VentesSemaine() {
  const { data, isError } = useQuery({
    queryKey: ['statistiques', '7j'],
    queryFn: async () => (await api.get<Resume7Jours>('/statistiques', { params: { periode: '7j' } })).data,
  });

  if (isError) {
    return (
      <section className="flex items-center justify-center rounded-xl border border-rule bg-surface p-6 text-corps text-steel-500 shadow-card">
        Ventes indisponibles pour le moment.
      </section>
    );
  }
  if (!data) {
    return (
      <section className="rounded-xl border border-rule bg-surface p-5 shadow-card" aria-busy="true">
        <Squelette className="h-3 w-32" />
        <Squelette className="mt-3 h-9 w-48" />
        <Squelette className="mt-6 h-[150px] w-full" />
      </section>
    );
  }

  const points = data.tendance;
  const aujourdhui = points.at(-1) ?? { debut: '', montant: 0, ventes: 0 };
  const hier = points.at(-2);
  const ecart = hier && hier.montant > 0 ? Math.round(((aujourdhui.montant - hier.montant) / hier.montant) * 100) : null;
  const max = Math.max(...points.map((p) => p.montant), 1);
  const Tendance = ecart !== null && ecart < 0 ? TrendingDown : TrendingUp;

  return (
    <section
      className="flex flex-col rounded-xl border border-rule bg-surface px-5 pt-5 pb-4 shadow-card sm:px-6"
      aria-labelledby="titre-ventes"
    >
      <p id="titre-ventes" className="flex items-center gap-2 text-meta font-semibold text-steel-500">
        <i className="size-2 rounded-full bg-action" aria-hidden="true" />
        Ventes d’aujourd’hui
      </p>
      <p className="mt-2 font-display text-[2.125rem] leading-none font-semibold tracking-[-0.03em] text-ink-900 sm:text-[2.375rem]">
        <Compteur valeur={aujourdhui.montant} format={formatNombre} /> <Gnf />
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-meta text-steel-500">
        <span>
          {aujourdhui.ventes} {pluriel('vente', aujourdhui.ventes)}
        </span>
        {ecart !== null && (
          <span className={cn('inline-flex items-center gap-1 font-semibold', ecart >= 0 ? 'text-ok' : 'text-rupture')}>
            <Tendance className="size-3.5" aria-hidden="true" />
            {ecart >= 0 ? '+' : '−'}
            {Math.abs(ecart)} % vs hier
          </span>
        )}
      </p>

      <div
        className="tdb-graphe mt-5"
        style={{ '--jours': points.length } as CSSProperties}
        role="img"
        aria-label={`Chiffre d’affaires des ${points.length} derniers jours : ${points
          .map((p) => `${jourLong.format(new Date(p.debut))}, ${formatNombre(p.montant)} GNF`)
          .join(' ; ')}`}
      >
        {points.map((p, i) => (
          <span
            key={p.debut}
            className="tdb-barre"
            data-jour={i === points.length - 1 ? '' : undefined}
            style={{ '--h': `${(p.montant / max) * 100}%`, '--n': i } as CSSProperties}
            title={`${jourLong.format(new Date(p.debut))} : ${formatNombre(p.montant)} GNF, ${p.ventes} ${pluriel('vente', p.ventes)}`}
          >
            <b aria-hidden="true">{montantCourt(p.montant)}</b>
            <i aria-hidden="true" />
          </span>
        ))}
        {!points.some((p) => p.montant > 0) && (
          <p className="absolute inset-x-0 top-1/2 z-[2] -translate-y-1/2 text-center text-corps text-steel-500">
            Aucune vente sur les 7 derniers jours.
          </p>
        )}
      </div>
      <div
        className="mt-2 grid gap-1.5 text-center text-meta text-steel-400 sm:gap-2.5"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {points.map((p, i) => (
          <span key={p.debut} className={i === points.length - 1 ? 'font-semibold text-ink-900' : undefined}>
            {i === points.length - 1 ? 'Auj.' : jourCourt.format(new Date(p.debut)).replace('.', '')}
          </span>
        ))}
      </div>

      <dl className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2 border-t border-rule pt-3.5 text-meta text-steel-500">
        <div>
          <dt>7 jours</dt>
          <dd className="text-[1.0625rem] font-semibold text-ink-900">
            {formatNombre(data.chiffreAffaires.valeur ?? 0)} <Gnf />
          </dd>
        </div>
        <div>
          <dt>Ventes</dt>
          <dd className="text-[1.0625rem] font-semibold text-ink-900">{formatNombre(data.ventes.valeur ?? 0)}</dd>
        </div>
        <div>
          <dt>Panier moyen</dt>
          <dd className="text-[1.0625rem] font-semibold text-ink-900">
            {data.panierMoyen.valeur === null ? '—' : formatNombre(Math.round(data.panierMoyen.valeur))}{' '}
            {data.panierMoyen.valeur !== null && <Gnf />}
          </dd>
        </div>
        <Link to="/ventes" className={lienActionClasses('ml-auto self-center')}>
          Voir les ventes
        <FlecheLien /></Link>
      </dl>
    </section>
  );
}
