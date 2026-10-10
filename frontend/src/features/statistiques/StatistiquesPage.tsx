import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCompact, formatNombre } from '@/lib/format';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { Onglets } from '@/components/patterns/Onglets';
import { EmptyState, ErrorState, Squelette } from '@/components/patterns/States';
import { Anneau, Chandeliers, CourbeTendance, Sparkline, type PartAnneau } from './graphiques';

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

const PERIODES = [
  { cle: '7j', libelle: '7 jours' },
  { cle: '30j', libelle: '30 jours' },
  { cle: '12m', libelle: '12 mois' },
] as const;

const LIBELLE_PERIODE: Record<Periode, string> = {
  '7j': '7 derniers jours',
  '30j': '30 derniers jours',
  '12m': '12 derniers mois',
};

const LIBELLE_MODE: Record<string, string> = {
  ESPECES: 'Espèces',
  ORANGE_MONEY: 'Orange Money',
  MTN_MOMO: 'MTN MoMo',
  CREDIT: 'Crédit client',
  AVOIR: 'Avoir',
};

// Classes écrites en entier : Tailwind ne génère que les noms qu'il trouve dans le code.
const SERIES = [
  { couleur: 'bg-serie-1', variable: '--color-serie-1' },
  { couleur: 'bg-serie-2', variable: '--color-serie-2' },
  { couleur: 'bg-serie-3', variable: '--color-serie-3' },
  { couleur: 'bg-serie-4', variable: '--color-serie-4' },
  { couleur: 'bg-serie-5', variable: '--color-serie-5' },
];

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

function BadgeVariation({ valeur, fond = true }: { valeur: number | null; fond?: boolean }) {
  if (valeur === null) return <span className="text-meta text-steel-500">—</span>;
  const hausse = valeur >= 0;
  const Icone = hausse ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full text-meta font-semibold whitespace-nowrap',
        fond && 'px-2 py-0.5',
        hausse ? 'text-ok' : 'text-rupture',
        fond && (hausse ? 'bg-ok-wash' : 'bg-rupture-wash'),
      )}
    >
      <Icone className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{hausse ? 'En hausse de' : 'En baisse de'}</span>
      {texteVariation(valeur)}
    </span>
  );
}

/**
 * Statistiques : tendance du chiffre d'affaires, indicateurs comparés à la
 * période précédente (façon cours de bourse), chandeliers du stock d'un
 * produit, plus fortes hausses et baisses, répartitions en anneaux.
 */
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

  const indicateurs = s
    ? [
        {
          titre: "Chiffre d'affaires",
          c: s.chiffreAffaires,
          unite: 'GNF',
          serie: s.tendance.map((p) => p.montant),
        },
        {
          titre: 'Ventes',
          c: s.ventes,
          unite: 'tickets',
          serie: s.tendance.map((p) => p.ventes),
        },
        { titre: 'Panier moyen', c: s.panierMoyen, unite: 'GNF', serie: [] },
        {
          titre: 'Rotation du stock',
          c: s.rotation,
          unite: 'fois sur la période',
          serie: [],
          decimales: true,
        },
      ]
    : [];

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

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Statistiques"
        description={`${LIBELLE_PERIODE[periode]}, comparés à la période précédente de même durée.`}
        action={<Onglets onglets={PERIODES} actif={periode} onChange={setPeriode} libelle="Période" />}
      />

      {stats.isError && !s ? (
        <ErrorState
          message={messageErreur(stats.error, 'Impossible de charger les statistiques.')}
          onRetry={() => stats.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {s
              ? indicateurs.map((k) => {
                  const v = variation(k.c);
                  return (
                    <Card key={k.titre} className="flex flex-col gap-2 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-meta font-medium text-steel-500">{k.titre}</h2>
                        <BadgeVariation valeur={v} />
                      </div>
                      <div className="flex items-end justify-between gap-2">
                        <p className="flex flex-wrap items-baseline gap-1.5">
                          <span className="font-mono text-[22px] font-medium tracking-tight text-ink-900">
                            {k.c.valeur === null
                              ? '—'
                              : k.decimales
                                ? k.c.valeur.toLocaleString('fr-FR', {
                                    maximumFractionDigits: 2,
                                  })
                                : formatNombre(k.c.valeur)}
                          </span>
                          {k.c.valeur !== null && <span className="text-meta text-steel-500">{k.unite}</span>}
                        </p>
                        <Sparkline valeurs={k.serie} hausse={(v ?? 0) >= 0} />
                      </div>
                    </Card>
                  );
                })
              : [0, 1, 2, 3].map((i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}
          </div>

          <Card>
            <PanneauEntete
              titre="Chiffre d'affaires"
              meta="Ventes validées, en GNF · survolez la courbe ou utilisez les flèches"
              action={
                s && (
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-mono text-[20px] font-medium text-ink-900">
                      {formatCompact(s.chiffreAffaires.valeur ?? 0)}
                    </span>
                    <BadgeVariation valeur={variation(s.chiffreAffaires)} fond={false} />
                  </div>
                )
              }
            />
            <div className="p-5">
              {s ? <CourbeTendance points={points} unite="GNF" /> : <Squelette className="h-64" />}
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <PanneauEntete
                titre="Niveau de stock par semaine"
                meta="Ouverture, plus haut, plus bas et clôture, tous emplacements"
                action={
                  h &&
                  h.produits.length > 0 && (
                    <label className="flex items-center gap-2 text-meta text-steel-500">
                      <span className="hidden sm:inline">Produit</span>
                      <select
                        value={h.produit?.id}
                        onChange={(e) => {
                          setProduitId(e.target.value);
                          setSemaine(null);
                        }}
                        className="h-9 max-w-[220px] rounded-md border border-rule-strong bg-surface-elevee px-2 text-corps text-ink-900"
                      >
                        {h.produits.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nom}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                }
              />
              <div className="flex flex-col gap-3 p-5">
                {hebdo.isError && !h ? (
                  <ErrorState
                    message={messageErreur(hebdo.error, 'Impossible de charger le niveau de stock.')}
                    onRetry={() => hebdo.refetch()}
                  />
                ) : !h ? (
                  <Squelette className="h-72" />
                ) : !h.produit ? (
                  <EmptyState
                    titre="Aucun produit"
                    description="Ajoutez des produits pour suivre l'évolution de leur stock."
                  />
                ) : (
                  <>
                    {b && (
                      <p
                        className="flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-paper px-3 py-2 text-meta text-steel-700"
                        aria-live="polite"
                      >
                        <span className="font-semibold text-ink-900">{b.long}</span>
                        <span>
                          Ouverture{' '}
                          <strong className="font-mono font-medium text-ink-900">{formatNombre(b.ouverture)}</strong>
                        </span>
                        <span>
                          Plus haut{' '}
                          <strong className="font-mono font-medium text-ink-900">{formatNombre(b.haut)}</strong>
                        </span>
                        <span>
                          Plus bas <strong className="font-mono font-medium text-ink-900">{formatNombre(b.bas)}</strong>
                        </span>
                        <span>
                          Clôture{' '}
                          <strong className="font-mono font-medium text-ink-900">{formatNombre(b.cloture)}</strong>
                        </span>
                        {b.cloture === 0 && <span className="font-semibold text-rupture">Rupture</span>}
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
            </Card>

            <Card className="lg:col-span-2">
              <PanneauEntete
                titre="Plus fortes variations"
                meta="Chiffre d'affaires par produit vs période précédente"
              />
              <div className="flex flex-col gap-4 p-5">
                {!s ? (
                  <Squelette className="h-64" />
                ) : (
                  (
                    [
                      {
                        titre: 'En hausse',
                        lignes: s.hausses,
                        Icone: TrendingUp,
                        couleur: 'text-ok',
                        barre: 'bg-ok',
                      },
                      {
                        titre: 'En baisse',
                        lignes: s.baisses,
                        Icone: TrendingDown,
                        couleur: 'text-rupture',
                        barre: 'bg-rupture',
                      },
                    ] as const
                  ).map((c) => {
                    const max = Math.max(1, ...c.lignes.map((l) => Math.abs(l.variation)));
                    return (
                      <div key={c.titre}>
                        <h3 className={cn('mb-1 flex items-center gap-1.5 text-meta font-semibold', c.couleur)}>
                          <c.Icone className="size-4" aria-hidden="true" />
                          {c.titre}
                        </h3>
                        {c.lignes.length === 0 ? (
                          <p className="border-t border-rule py-2 text-meta text-steel-500">
                            Aucun produit sur cette période.
                          </p>
                        ) : (
                          <ol>
                            {c.lignes.map((l) => (
                              <li
                                key={l.produitId}
                                className="grid grid-cols-[minmax(0,1fr)_64px_68px] items-center gap-2.5 border-t border-rule py-2 text-meta"
                              >
                                <span
                                  className="truncate text-ink-900"
                                  title={`${formatNombre(l.montant)} GNF (avant : ${formatNombre(l.precedent)} GNF)`}
                                >
                                  {l.nom}
                                </span>
                                <span className="h-1.5 rounded-full bg-paper" aria-hidden="true">
                                  <span
                                    className={cn('block h-1.5 rounded-full', c.barre)}
                                    style={{
                                      width: `${(Math.abs(l.variation) / max) * 100}%`,
                                    }}
                                  />
                                </span>
                                <span className={cn('text-right font-mono font-medium', c.couleur)}>
                                  {texteVariation(l.variation)}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {s ? (
              <>
                <Card>
                  <PanneauEntete titre="Valeur du stock par catégorie" meta="Au prix d'achat, aujourd'hui" />
                  <div className="p-5">
                    <Anneau
                      titre="Valeur du stock par catégorie"
                      parts={s.valeurParCategorie.map(
                        (c, i): PartAnneau => ({
                          libelle: c.libelle,
                          valeur: c.valeur,
                          ...SERIES[i % 5],
                        }),
                      )}
                      total={formatCompact(s.valeurParCategorie.reduce((t, c) => t + c.valeur, 0))}
                      uniteTotal="GNF"
                      formatPart={(p, pct) => `${formatCompact(p.valeur)} · ${pct} %`}
                    />
                  </div>
                </Card>
                <Card>
                  <PanneauEntete titre="Ventes par mode de paiement" meta={LIBELLE_PERIODE[periode]} />
                  <div className="p-5">
                    <Anneau
                      titre="Ventes par mode de paiement"
                      parts={s.ventesParMode.map(
                        (m, i): PartAnneau => ({
                          libelle: LIBELLE_MODE[m.mode] ?? m.mode,
                          valeur: m.montant,
                          ...SERIES[i % 5],
                        }),
                      )}
                      total={formatCompact(s.chiffreAffaires.valeur ?? 0)}
                      uniteTotal="GNF"
                      formatPart={(_, pct) => `${pct} %`}
                    />
                  </div>
                </Card>
                <Card>
                  <PanneauEntete titre="État du stock" meta="Produits suivis, hors archivés" />
                  <div className="p-5">
                    <Anneau
                      titre="État du stock"
                      parts={[
                        {
                          libelle: 'En stock',
                          valeur: s.etatStock.enStock,
                          couleur: 'bg-ok',
                          variable: '--color-ok',
                        },
                        {
                          libelle: 'Sous le seuil',
                          valeur: s.etatStock.faible,
                          couleur: 'bg-faible',
                          variable: '--color-faible',
                        },
                        {
                          libelle: 'Rupture',
                          valeur: s.etatStock.rupture,
                          couleur: 'bg-rupture',
                          variable: '--color-rupture',
                        },
                      ].filter((p) => p.valeur > 0)}
                      total={formatNombre(s.etatStock.enStock + s.etatStock.faible + s.etatStock.rupture)}
                      uniteTotal="produits"
                      formatPart={(p, pct) => `${formatNombre(p.valeur)} · ${pct} %`}
                    />
                  </div>
                </Card>
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
