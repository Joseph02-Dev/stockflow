import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatCompact, formatNombre, pluriel } from '@/lib/format';
import { PageHeader } from '@/components/patterns/Page';
import { Compteur } from '@/components/patterns/Compteur';
import { EmptyState, ErrorState, Squelette } from '@/components/patterns/States';
import { Chandeliers, CourbeTendance } from './graphiques';
import './statistiques.css';
import { FlecheLien } from '@/components/ui/LienAction';
import { lienActionClasses } from '@/components/ui/lienActionClasses';

type Periode = '7j' | '30j' | '12m';

interface Comparaison {
  valeur: number | null;
  precedent: number | null;
}

interface LigneVariation {
  produitId: string;
  nom: string;
  montant: number;
  precedent: number;
  variation: number;
}

interface Statistiques {
  unite: 'day' | 'month';
  tendance: { debut: string; montant: number; ventes: number }[];
  chiffreAffaires: Comparaison;
  ventes: Comparaison;
  panierMoyen: Comparaison;
  rotation: Comparaison;
  hausses: LigneVariation[];
  baisses: LigneVariation[];
  valeurParCategorie: { libelle: string; valeur: number }[];
  ventesParMode: { mode: string; montant: number }[];
  etatStock: { enStock: number; faible: number; rupture: number };
}

interface StockHebdo {
  produit: { id: string; nom: string; uniteMesure: string | null } | null;
  produits: { id: string; nom: string }[];
  semaines: {
    debut: string;
    ouverture: number;
    haut: number;
    bas: number;
    cloture: number;
  }[];
}

const PERIODES: { cle: Periode; libelle: string }[] = [
  { cle: '7j', libelle: '7 jours' },
  { cle: '30j', libelle: '30 jours' },
  { cle: '12m', libelle: '12 mois' },
];

const LIBELLE_PERIODE: Record<Periode, string> = {
  '7j': '7 derniers jours',
  '30j': '30 derniers jours',
  '12m': '12 derniers mois',
};

const PERIODE_PRECEDENTE: Record<Periode, string> = {
  '7j': 'les 7 jours précédents',
  '30j': 'les 30 jours précédents',
  '12m': 'les 12 mois précédents',
};

const LIBELLE_MODE: Record<string, string> = {
  ESPECES: 'Espèces',
  ORANGE_MONEY: 'Orange Money',
  MTN_MOMO: 'MTN MoMo',
  CREDIT: 'Crédit client',
  AVOIR: 'Avoir',
};

const SERIES = ['var(--color-serie-1)', 'var(--color-serie-2)', 'var(--color-serie-3)', 'var(--color-serie-4)', 'var(--color-serie-5)'];

const date = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'UTC', ...options });

/** Variation en % entre deux valeurs ; null si la référence est nulle. */
function variation(c: Comparaison): number | null {
  if (c.valeur === null || !c.precedent) return null;
  return ((c.valeur - c.precedent) / c.precedent) * 100;
}

function texteVariation(v: number): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** Variation sur fond sombre (bandeau). */
function PiluleVariation({ valeur }: { valeur: number | null }) {
  if (valeur === null) return null;
  const hausse = valeur >= 0;
  const Icone = hausse ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="statistiques-pilule" data-baisse={hausse ? undefined : ''}>
      <Icone className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{hausse ? 'En hausse de' : 'En baisse de'}</span>
      {texteVariation(valeur)}
    </span>
  );
}

/** Répartition en barre empilée, avec sa légende chiffrée. */
function Repartition({
  parts,
  formatValeur,
  libelle,
}: {
  parts: { libelle: string; valeur: number; couleur: string }[];
  formatValeur: (v: number) => string;
  libelle: string;
}) {
  const total = parts.reduce((a, p) => a + p.valeur, 0);
  const visibles = parts.filter((p) => p.valeur > 0);
  if (total <= 0) return <p className="text-corps text-steel-500">Rien à afficher sur cette période.</p>;
  return (
    <>
      <div
        className="statistiques-barre"
        role="img"
        aria-label={`${libelle} : ${visibles.map((p) => `${p.libelle} ${Math.round((p.valeur / total) * 100)} %`).join(', ')}`}
      >
        {visibles.map((p) => (
          <i key={p.libelle} style={{ background: p.couleur, flex: `${p.valeur} 0 0` }} />
        ))}
      </div>
      <ul className="mt-3">
        {parts.map((p) => (
          <li key={p.libelle} className="grid grid-cols-[10px_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-t border-rule py-2 text-corps first:border-t-0">
            <span className="size-2.5 rounded-[3px]" style={{ background: p.couleur }} aria-hidden="true" />
            <span className="truncate text-steel-700">{p.libelle}</span>
            <span className="font-mono text-[12.5px] font-semibold text-ink-900">{formatValeur(p.valeur)}</span>
            <span className="min-w-[38px] text-right font-mono text-[12px] text-steel-400">{Math.round((p.valeur / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Statistiques : chiffre d'affaires de la période et sa courbe, indicateurs
 * comparés à la période précédente, produits qui ont fait la différence,
 * chandeliers du stock d'un produit, répartitions en barres.
 */

const formatDecimal = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

export function StatistiquesPage() {
  const [periode, setPeriode] = useState<Periode>('30j');
  const [produitId, setProduitId] = useState<string | undefined>();
  const [semaine, setSemaine] = useState<number | null>(null);

  const stats = useQuery({
    queryKey: ['statistiques', periode],
    queryFn: async () => (await api.get<Statistiques>('/statistiques', { params: { periode } })).data,
    placeholderData: keepPreviousData,
  });
  const hebdo = useQuery({
    queryKey: ['statistiques', 'stock-hebdo', produitId ?? 'auto'],
    queryFn: async () =>
      (
        await api.get<StockHebdo>('/statistiques/stock-hebdo', {
          params: { produitId },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const s = stats.data;
  const mensuel = s?.unite === 'month';
  const points =
    s?.tendance.map((p) => ({
      court: mensuel ? date(p.debut, { month: 'short' }) : date(p.debut, { day: 'numeric', month: 'short' }),
      long: mensuel
        ? date(p.debut, { month: 'long', year: 'numeric' })
        : date(p.debut, { weekday: 'long', day: 'numeric', month: 'long' }),
      valeur: p.montant,
    })) ?? [];

  const h = hebdo.data;
  const unite = h?.produit?.uniteMesure ?? 'unités';
  const bougies =
    h?.semaines.map((w) => ({
      court: date(w.debut, { day: '2-digit', month: '2-digit' }),
      long: `Semaine du ${date(w.debut, { day: 'numeric', month: 'long' })}`,
      ouverture: w.ouverture,
      haut: w.haut,
      bas: w.bas,
      cloture: w.cloture,
    })) ?? [];
  const b = bougies[semaine ?? bougies.length - 1];

  // Part d'un produit dans l'évolution totale du chiffre d'affaires (affichée seulement si elle a un sens).
  const ecartTotal = s && s.chiffreAffaires.valeur !== null && s.chiffreAffaires.precedent !== null ? s.chiffreAffaires.valeur - s.chiffreAffaires.precedent : 0;
  const part = (l: LigneVariation) => {
    const ratio = ecartTotal !== 0 ? (l.montant - l.precedent) / ecartTotal : 0;
    return ratio > 0 && ratio <= 1 ? ratio : null;
  };
  const totalModes = s?.ventesParMode.reduce((a, m) => a + m.montant, 0) ?? 0;
  const credit = s?.ventesParMode.find((m) => m.mode === 'CREDIT')?.montant ?? 0;
  const partCredit = totalModes > 0 ? Math.round((credit / totalModes) * 100) : 0;
  const valeurStock = s?.valeurParCategorie.reduce((a, c) => a + c.valeur, 0) ?? 0;
  const produitsSuivis = s ? s.etatStock.enStock + s.etatStock.faible + s.etatStock.rupture : 0;

  const indicateurs = s
    ? [
        { titre: 'Ventes', c: s.ventes, unite: pluriel('ticket', s.ventes.valeur ?? 0) },
        { titre: 'Panier moyen', c: s.panierMoyen, unite: 'GNF' },
        { titre: 'Rotation du stock', c: s.rotation, unite: 'fois', decimales: true },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader titre="Statistiques" description="Comment se porte votre activité, comparée à la période précédente de même durée." />

      {stats.isError && !s ? (
        <ErrorState message={messageErreur(stats.error, 'Impossible de charger les statistiques.')} onRetry={() => stats.refetch()} />
      ) : (
        <>
          <section className="bandeau-action statistiques-bandeau text-white" aria-labelledby="titre-ca">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id="titre-ca" className="text-[13px] text-white/65">
                  Chiffre d’affaires · {LIBELLE_PERIODE[periode]}
                </h2>
                <p className="mt-1.5 font-display text-[34px] leading-none font-semibold tracking-[-0.03em] tabular-nums sm:text-[42px]">
                  {s ? s.chiffreAffaires.valeur === null ? '—' : <Compteur valeur={s.chiffreAffaires.valeur} format={formatNombre} /> : '…'}{' '}
                  <span className="font-sans text-[16px] font-semibold tracking-normal text-white/55">GNF</span>
                </p>
                {s && (
                  <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[13.5px] text-white/70">
                    {s.chiffreAffaires.precedent ? (
                      <>
                        <PiluleVariation valeur={variation(s.chiffreAffaires)} />
                        contre {formatNombre(s.chiffreAffaires.precedent)} GNF {PERIODE_PRECEDENTE[periode]}
                      </>
                    ) : (
                      `Aucune vente sur ${PERIODE_PRECEDENTE[periode]} : rien à comparer.`
                    )}
                  </p>
                )}
              </div>
              <div className="statistiques-periodes" role="group" aria-label="Période">
                {PERIODES.map((p) => (
                  <button key={p.cle} type="button" aria-pressed={periode === p.cle} onClick={() => setPeriode(p.cle)}>
                    {p.libelle}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">{s ? <CourbeTendance points={points} unite="GNF" sombre /> : <Squelette className="h-60 bg-white/10!" />}</div>

            <div className="statistiques-kpis">
              {s
                ? indicateurs.map((k) => {
                    const v = variation(k.c);
                    return (
                      <div key={k.titre} className="statistiques-kpi">
                        <p className="text-[12px] text-white/65">{k.titre}</p>
                        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                          <p className="font-display text-[19px] leading-none font-semibold tabular-nums sm:text-[21px]">
                            {k.c.valeur === null ? (
                              '—'
                            ) : (
                              <>
                                <Compteur valeur={k.c.valeur} format={k.decimales ? formatDecimal : formatNombre} />{' '}
                                <span className="font-sans text-[12px] font-semibold text-white/50">{k.unite}</span>
                              </>
                            )}
                          </p>
                          {v === null ? <span className="text-[12px] text-white/50">pas de comparaison</span> : <PiluleVariation valeur={v} />}
                        </div>
                      </div>
                    );
                  })
                : [0, 1, 2].map((i) => <Squelette key={i} className="h-[70px] rounded-xl bg-white/10!" />)}
            </div>
          </section>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <section className="statistiques-carte" aria-labelledby="titre-difference">
              <div className="px-4 pt-4 sm:px-5">
                <h2 id="titre-difference" className="text-[15.5px] font-semibold text-ink-900">
                  Ce qui a fait la différence
                </h2>
                <p className="text-[12.5px] text-steel-400">Chiffre d’affaires par produit, comparé à {PERIODE_PRECEDENTE[periode]}</p>
              </div>
              <div className="px-4 pt-3 pb-4 sm:px-5">
                {!s ? (
                  <Squelette className="h-64" />
                ) : !s.chiffreAffaires.precedent && s.hausses.length === 0 && s.baisses.length === 0 ? (
                  <p className="py-2 text-corps text-steel-400">Aucune vente sur {PERIODE_PRECEDENTE[periode]} : rien à comparer.</p>
                ) : (
                  (
                    [
                      { titre: 'En hausse', lignes: s.hausses, Icone: ArrowUpRight, teinte: 'var(--color-ok)', vide: 'Aucun produit n’a progressé sur cette période.', mot: 'hausse' },
                      { titre: 'En baisse', lignes: s.baisses, Icone: ArrowDownRight, teinte: 'var(--color-rupture)', vide: 'Aucun produit n’a reculé sur cette période.', mot: 'baisse' },
                    ] as const
                  ).map((c, n) => (
                    <div key={c.titre} className={n > 0 ? 'mt-4' : undefined} style={{ '--teinte': c.teinte } as CSSProperties}>
                      <h3 className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-(--teinte)">
                        <c.Icone className="size-4" aria-hidden="true" />
                        {c.titre}
                      </h3>
                      {c.lignes.length === 0 ? (
                        <p className="py-2 text-corps text-steel-400">{c.vide}</p>
                      ) : (
                        <ol>
                          {c.lignes.map((l, i) => {
                            const ecart = l.montant - l.precedent;
                            const p = part(l);
                            return (
                              <li key={l.produitId} className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-rule py-2.5 first:border-t-0">
                                <span className="statistiques-rang" aria-hidden="true">
                                  {i + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-[14px] font-semibold text-ink-900">{l.nom}</p>
                                  <p className="text-[12px] text-steel-400 tabular-nums">
                                    {formatNombre(l.montant)} GNF · avant {formatNombre(l.precedent)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-mono text-[14px] font-semibold whitespace-nowrap text-(--teinte)">
                                    {ecart >= 0 ? '+' : '−'}
                                    {formatNombre(Math.abs(ecart))}
                                  </p>
                                  <p className="text-[11.5px] text-steel-400">{texteVariation(l.variation)}</p>
                                </div>
                                {p !== null && (
                                  <div className="col-start-2 col-end-4 flex items-center gap-2 text-[11.5px] text-steel-400">
                                    <span className="statistiques-jauge" aria-hidden="true">
                                      <i style={{ width: `${p * 100}%` }} />
                                    </span>
                                    <span className="tabular-nums">
                                      {Math.round(p * 100)} % de la {c.mot}
                                    </span>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="statistiques-carte" aria-labelledby="titre-hebdo">
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
                <div className="min-w-0">
                  <h2 id="titre-hebdo" className="text-[15.5px] font-semibold text-ink-900">
                    Stock d’un produit, semaine par semaine
                  </h2>
                  <p className="text-[12.5px] text-steel-400">Tous emplacements · ouverture, plus haut, plus bas, clôture</p>
                </div>
                {h && h.produits.length > 0 && (
                  <label className="flex items-center gap-2 text-meta text-steel-500">
                    <span className="sr-only">Produit</span>
                    <select
                      value={h.produit?.id}
                      onChange={(e) => {
                        setProduitId(e.target.value);
                        setSemaine(null);
                      }}
                      className="h-9 max-w-[220px] champ rounded-lg border border-rule-strong bg-surface-elevee px-2 text-corps font-semibold text-ink-900"
                    >
                      {h.produits.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="flex flex-col gap-3 px-4 pt-3 pb-4 sm:px-5">
                {hebdo.isError && !h ? (
                  <ErrorState message={messageErreur(hebdo.error, 'Impossible de charger le niveau de stock.')} onRetry={() => hebdo.refetch()} />
                ) : !h ? (
                  <Squelette className="h-72" />
                ) : !h.produit ? (
                  <EmptyState titre="Aucun produit" description="Ajoutez des produits pour suivre l'évolution de leur stock." />
                ) : (
                  <>
                    {b && (
                      <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-steel-500" aria-live="polite">
                        <span className="mr-1 font-semibold text-ink-900">{b.long}</span>
                        {(
                          [
                            ['Ouverture', b.ouverture],
                            ['Plus haut', b.haut],
                            ['Plus bas', b.bas],
                            ['Clôture', b.cloture],
                          ] as const
                        ).map(([l, v]) => (
                          <span key={l} className="rounded-lg bg-paper px-2 py-1">
                            {l} <strong className="font-mono font-semibold text-ink-900">{formatNombre(v)}</strong>
                          </span>
                        ))}
                        {b.cloture <= 0 && <span className="font-semibold text-rupture">Rupture</span>}
                      </p>
                    )}
                    <Chandeliers bougies={bougies} unite={unite} onSurvol={setSemaine} />
                    <div className="flex flex-wrap gap-4 text-meta text-steel-700">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-4 w-3 rounded-[2px] border-2 border-action bg-surface" aria-hidden="true" />
                        Hausse (réapprovisionnement)
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-4 w-3 rounded-[2px] bg-serie-2" aria-hidden="true" />
                        Baisse (ventes et sorties)
                      </span>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {s ? (
              <>
                <section className="statistiques-carte p-4 sm:p-5" aria-labelledby="titre-modes">
                  <h2 id="titre-modes" className="text-[15.5px] font-semibold text-ink-900">
                    Comment vos clients paient
                  </h2>
                  <p className="mb-3.5 text-[12.5px] text-steel-400">Ventes des {LIBELLE_PERIODE[periode]}</p>
                  <Repartition
                    libelle="Ventes par mode de paiement"
                    formatValeur={formatCompact}
                    parts={s.ventesParMode.map((m, i) => ({ libelle: LIBELLE_MODE[m.mode] ?? m.mode, valeur: m.montant, couleur: SERIES[i % SERIES.length] }))}
                  />
                  {partCredit > 0 && (
                    <p className="statistiques-encart" style={{ '--teinte': 'var(--color-action)' } as CSSProperties}>
                      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>
                        <b>{partCredit} % vendus à crédit</b> sur la période.{' '}
                        <Link to="/creances" className={lienActionClasses()}>
                          Voir les créances
                          <FlecheLien />
                        </Link>
                      </span>
                    </p>
                  )}
                </section>
                <section className="statistiques-carte p-4 sm:p-5" aria-labelledby="titre-categories">
                  <h2 id="titre-categories" className="text-[15.5px] font-semibold text-ink-900">
                    Valeur du stock par catégorie
                  </h2>
                  <p className="mb-3 text-[12.5px] text-steel-400">Au prix d’achat, aujourd’hui</p>
                  <p className="mb-3 font-display text-[24px] leading-none font-semibold text-ink-900 tabular-nums">
                    {formatNombre(valeurStock)} <span className="font-sans text-[13px] font-semibold text-steel-400">GNF</span>
                  </p>
                  <Repartition
                    libelle="Valeur du stock par catégorie"
                    formatValeur={formatCompact}
                    parts={s.valeurParCategorie.map((c, i) => ({ libelle: c.libelle, valeur: c.valeur, couleur: SERIES[i % SERIES.length] }))}
                  />
                </section>
                <section className="statistiques-carte p-4 sm:p-5" aria-labelledby="titre-etat">
                  <h2 id="titre-etat" className="text-[15.5px] font-semibold text-ink-900">
                    État du stock
                  </h2>
                  <p className="mb-3 text-[12.5px] text-steel-400">Produits suivis, hors archivés</p>
                  <p className="mb-3 font-display text-[24px] leading-none font-semibold text-ink-900 tabular-nums">
                    {formatNombre(produitsSuivis)} <span className="font-sans text-[13px] font-semibold text-steel-400">{pluriel('produit', produitsSuivis)}</span>
                  </p>
                  <Repartition
                    libelle="État du stock"
                    formatValeur={formatNombre}
                    parts={[
                      { libelle: 'En stock', valeur: s.etatStock.enStock, couleur: 'var(--color-ok)' },
                      { libelle: 'Sous le seuil', valeur: s.etatStock.faible, couleur: 'var(--color-faible)' },
                      { libelle: 'Rupture', valeur: s.etatStock.rupture, couleur: 'var(--color-rupture)' },
                    ]}
                  />
                  {s.etatStock.rupture > 0 && (
                    <p className="statistiques-encart" style={{ '--teinte': 'var(--color-rupture)' } as CSSProperties}>
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>
                        <b>
                          {s.etatStock.rupture} {pluriel('produit', s.etatStock.rupture)} en rupture
                        </b>{' '}
                        : {s.etatStock.rupture > 1 ? 'ils ne peuvent plus être vendus' : 'il ne peut plus être vendu'}.{' '}
                        <Link to="/alertes" className={lienActionClasses()}>
                          Voir les alertes
                          <FlecheLien />
                        </Link>
                      </span>
                    </p>
                  )}
                </section>
              </>
            ) : (
              [0, 1, 2].map((i) => <Squelette key={i} className="h-60 rounded-lg" />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
