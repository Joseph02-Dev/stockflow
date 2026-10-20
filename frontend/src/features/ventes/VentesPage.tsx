import { Fragment, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { pageSuivante, urlPage } from '@/lib/pagination';
import { Button } from '@/components/ui/Button';
import { dateCourte, dateHeure, gnf } from '@/lib/montant';
import { formatNombre, pluriel } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { Compteur } from '@/components/patterns/Compteur';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { MODES } from './modes';
import type { ModePaiement, VenteResume } from './types';

const LIEN_NOUVELLE = boutonClasses('primary');

/** Résumé des 7 derniers jours : même requête (et même cache) que l'écran Statistiques. */
interface Resume7Jours {
  chiffreAffaires: { valeur: number | null; precedent: number | null };
  ventes: { valeur: number | null; precedent: number | null };
  panierMoyen: { valeur: number | null; precedent: number | null };
  ventesParMode: { mode: string; montant: number }[];
}

const CARTE =
  'rounded-lg border border-rule bg-surface px-4 py-4 shadow-card transition-[transform,box-shadow] duration-200 ease-sortie hover:-translate-y-0.5 hover:shadow-pop motion-reduce:transform-none sm:px-5';

function Variation({ valeur, precedent }: { valeur: number | null; precedent: number | null }) {
  if (valeur === null || !precedent) return <span className="text-meta text-steel-400">vs 7 jours précédents</span>;
  const ecart = Math.round(((valeur - precedent) / precedent) * 100);
  const hausse = ecart >= 0;
  const Icone = hausse ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-1 text-meta font-medium', hausse ? 'text-ok' : 'text-rupture')}>
      <Icone className="size-3.5" aria-hidden="true" />
      {hausse ? '+' : '−'}
      {Math.abs(ecart)} % vs 7 jours précédents
    </span>
  );
}

function ResumeVentes() {
  const { data } = useQuery({
    queryKey: ['statistiques', '7j'],
    queryFn: async () => (await api.get<Resume7Jours>('/statistiques', { params: { periode: '7j' } })).data,
  });
  // Indicatif : la liste reste lisible si le résumé n'arrive pas.
  if (!data) return null;
  const totalModes = data.ventesParMode.reduce((n, m) => n + m.montant, 0);
  const mesures = [
    { libelle: "Chiffre d'affaires", c: data.chiffreAffaires, unite: 'GNF' },
    { libelle: 'Ventes', c: data.ventes, unite: pluriel('ticket', data.ventes.valeur ?? 0) },
    { libelle: 'Panier moyen', c: data.panierMoyen, unite: 'GNF' },
  ];
  return (
    <section aria-label="Les 7 derniers jours" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
      {mesures.map(({ libelle, c, unite }) => (
        <div key={libelle} className={CARTE}>
          <p className="text-meta font-medium text-steel-500">{libelle} · 7 jours</p>
          <p className="mt-2 text-chiffre text-ink-900">
            {c.valeur === null ? (
              '—'
            ) : (
              <>
                <Compteur valeur={c.valeur} format={formatNombre} />{' '}
                <span className="text-corps font-medium text-steel-400">{unite}</span>
              </>
            )}
          </p>
          <p className="mt-1">
            <Variation valeur={c.valeur} precedent={c.precedent} />
          </p>
        </div>
      ))}
      <div className={cn(CARTE, 'sm:col-span-3 xl:col-span-1')}>
        <p className="text-meta font-medium text-steel-500">Encaissé par mode · 7 jours</p>
        {totalModes === 0 ? (
          <p className="mt-3 text-corps text-steel-400">Aucune vente sur la période.</p>
        ) : (
          <>
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-paper" aria-hidden="true">
              {data.ventesParMode.map((m) => (
                <span
                  key={m.mode}
                  className={cn('h-full transition-[width] duration-500 ease-sortie', MODES[m.mode as ModePaiement]?.point ?? 'bg-steel-400')}
                  style={{ width: `${(m.montant / totalModes) * 100}%` }}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {data.ventesParMode.map((m) => (
                <li key={m.mode} className="flex items-center gap-1.5 text-meta text-steel-500">
                  <span className={cn('size-2 rounded-full', MODES[m.mode as ModePaiement]?.point ?? 'bg-steel-400')} aria-hidden="true" />
                  {MODES[m.mode as ModePaiement]?.libelle ?? m.mode}
                  <span className="font-semibold text-ink-900">{Math.round((m.montant / totalModes) * 100)} %</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

const jourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const cleJour = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** « Aujourd'hui », « Hier » ou « mardi 14 octobre ». */
function libelleJour(date: Date, maintenant: Date) {
  const hier = new Date(maintenant);
  hier.setDate(hier.getDate() - 1);
  if (cleJour(date) === cleJour(maintenant)) return 'Aujourd’hui';
  if (cleJour(date) === cleJour(hier)) return 'Hier';
  return jourLong.format(date);
}

function Statut({ vente }: { vente: VenteResume }) {
  if (vente.statut === 'ANNULEE') return <Badge variant="rupture">Annulée</Badge>;
  if (vente.resteDu > 0) return <Badge variant="faible">Reste {gnf(vente.resteDu)}</Badge>;
  return <Badge variant="ok">Réglée</Badge>;
}

export function VentesPage() {
  // Historique par pages de 50 (« Afficher plus ») : jamais toutes les ventes d'un coup.
  const { data, isLoading, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['ventes', 'liste'],
    queryFn: async ({ pageParam }) => (await api.get<VenteResume[]>(urlPage('/ventes', new URLSearchParams(), pageParam))).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (derniere) => pageSuivante(derniere),
  });
  const ventes = data?.pages.flat() ?? [];
  const [maintenant] = useState(() => new Date());

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Ventes"
        description="Chaque vente, son client, ce qui a été payé et ce qui reste dû."
        action={
          <Link to="/ventes/nouvelle" className={LIEN_NOUVELLE}>
            <Plus className="size-4" aria-hidden="true" />
            Nouvelle vente
          </Link>
        }
      />

      <ResumeVentes />

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : ventes.length === 0 ? (
          <EmptyState
            titre="Aucune vente"
            description="Enregistrez votre première vente : le stock et la dette du client se mettent à jour d’eux-mêmes."
            action={
              <Link to="/ventes/nouvelle" className={LIEN_NOUVELLE}>
                Nouvelle vente
              </Link>
            }
          />
        ) : (
          <>
            <PanneauEntete
              titre={hasNextPage ? `${ventes.length} dernières ventes` : `${ventes.length} ${pluriel('vente', ventes.length)}`}
              meta="Les plus récentes d’abord"
            />
            <ul className="divide-y divide-rule">
              {ventes.map((v, i) => {
                const jour = new Date(v.createdAt);
                const nouveauJour = i === 0 || cleJour(jour) !== cleJour(new Date(ventes[i - 1].createdAt));
                const { Icone, libelle, teinte } = MODES[v.modePaiement];
                return (
                  <Fragment key={v.id}>
                    {nouveauJour && (
                      <li className="bg-entete-groupe px-4 py-2 text-meta font-semibold tracking-[0.04em] text-steel-500 uppercase sm:px-5">
                        {libelleJour(jour, maintenant)}
                      </li>
                    )}
                    <li>
                      <Link
                        to={`/ventes/${v.id}`}
                        className={cn(
                          'group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-entete-tableau sm:px-5',
                          v.statut === 'ANNULEE' && 'opacity-70',
                        )}
                      >
                        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', teinte)} title={libelle} aria-hidden="true">
                          <Icone className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-corps font-medium text-ink-900">{v.client?.nom ?? 'Client de passage'}</p>
                          <p className="truncate text-meta text-steel-500">
                            <span className="font-mono whitespace-nowrap">{v.numero}</span> ·{' '}
                            <span className="sm:hidden">{dateCourte(v.createdAt)}</span>
                            <span className="hidden sm:inline">{dateHeure(v.createdAt)}</span>
                            <span className="hidden sm:inline">
                              {' '}
                              · {v.nombreLignes} {pluriel('article', v.nombreLignes)} · {libelle}
                            </span>
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={cn(
                              'font-display text-[15px] font-semibold tracking-[-0.01em] text-ink-900',
                              v.statut === 'ANNULEE' && 'line-through',
                            )}
                          >
                            {gnf(v.total)}
                          </span>
                          <Statut vente={v} />
                        </div>
                        <ChevronRight
                          className="size-4 shrink-0 text-steel-400 transition-transform duration-200 ease-sortie group-hover:translate-x-0.5 group-hover:text-ink-900"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
            {hasNextPage && (
              <div className="flex justify-center border-t border-rule p-3">
                <Button variant="secondary" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
                  Afficher plus de ventes
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
