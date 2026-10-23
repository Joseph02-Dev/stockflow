import { Fragment, useState, type CSSProperties } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { messageErreur } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { apiConsole } from './api';
import { Pagination } from './Pagination';
import { ACTIONS_JOURNAL } from './actionsJournal';
import type { EntreeJournal } from './actionsJournal';
import { PhraseJournal } from './PhraseJournal';
import type { ActionAudit, Page } from './types';
import './console.css';

const FILTRES: (ActionAudit | 'TOUTES')[] = [
  'TOUTES',
  'SUSPENSION',
  'RETABLISSEMENT',
  'MODIFICATION_REGLAGES',
  'CONSULTATION_ENTREPRISE',
  'CONNEXION',
];

const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const jourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** « Aujourd’hui », « Hier », sinon la date complète. */
function libelleJour(date: Date, maintenant: Date): string {
  const minuit = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const ecart = Math.round((minuit(maintenant) - minuit(date)) / 86_400_000);
  if (ecart === 0) return 'Aujourd’hui';
  if (ecart === 1) return 'Hier';
  const texte = jourLong.format(date);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

export function ConsoleJournalPage() {
  const [parametres, setParametres] = useSearchParams();
  const entrepriseId = parametres.get('entrepriseId');
  const [action, setAction] = useState<ActionAudit | 'TOUTES'>('TOUTES');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['console', 'journal', entrepriseId, action, page],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), taille: '30' });
      if (entrepriseId) p.set('entrepriseId', entrepriseId);
      if (action !== 'TOUTES') p.set('action', action);
      return (await apiConsole.get<Page<EntreeJournal>>(`/console/journal?${p.toString()}`)).data;
    },
    placeholderData: keepPreviousData,
  });

  const nomFiltre = data?.elements.find((e) => e.entreprise?.id === entrepriseId)?.entreprise?.nom;
  const maintenant = new Date(dataUpdatedAt);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader titre="Journal d’audit" description="Toutes les actions des opérateurs, conservées et non modifiables." />

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par action">
        {FILTRES.map((f) => {
          const a = f === 'TOUTES' ? null : ACTIONS_JOURNAL[f];
          return (
            <button
              key={f}
              type="button"
              aria-pressed={action === f}
              onClick={() => {
                setAction(f);
                setPage(1);
              }}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-corps font-semibold whitespace-nowrap transition-colors',
                action === f
                  ? 'border-action bg-action-wash text-action'
                  : 'border-rule bg-surface text-steel-700 hover:border-rule-strong',
              )}
            >
              {a && <a.Icone className="size-3.5" strokeWidth={1.75} style={{ color: action === f ? undefined : a.couleur }} aria-hidden="true" />}
              {a ? a.filtre : 'Toutes'}
            </button>
          );
        })}
        {entrepriseId && (
          <button
            type="button"
            onClick={() => {
              setParametres({});
              setPage(1);
            }}
            className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-inverse px-3 text-corps text-sur-inverse"
          >
            {nomFiltre ?? 'Une entreprise'}
            <X className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Retirer le filtre d’entreprise</span>
          </button>
        )}
      </div>

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError || !data ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : data.total === 0 ? (
          <EmptyState titre="Aucune entrée" description="Rien n’a encore été journalisé pour ces critères." />
        ) : (
          <>
            <ol>
              {data.elements.map((e, i) => {
                const a = ACTIONS_JOURNAL[e.action];
                const date = new Date(e.createdAt);
                const jour = libelleJour(date, maintenant);
                const nouveauJour = i === 0 || libelleJour(new Date(data.elements[i - 1].createdAt), maintenant) !== jour;
                return (
                  <Fragment key={e.id}>
                    {nouveauJour && (
                      <li className="px-5 pt-3.5 pb-1 text-[12px] font-bold tracking-[0.06em] text-steel-400 uppercase" aria-hidden="true">
                        {jour}
                      </li>
                    )}
                    <li
                      className="grid grid-cols-[30px_minmax(0,1fr)] items-start gap-x-3 px-5 py-2.5 sm:grid-cols-[34px_minmax(0,1fr)_auto]"
                      style={{ '--c': a.couleur } as CSSProperties}
                    >
                      <span className="console-pastille console-pastille-sm sm:size-[34px]" aria-hidden="true">
                        <a.Icone className="size-[15px]" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <PhraseJournal entree={e} />
                        {e.motif && <p className="console-motif">Motif : {e.motif}</p>}
                        {e.entreprise && e.detail && <p className="mt-0.5 text-meta text-steel-400">{e.detail}</p>}
                      </div>
                      <time
                        dateTime={e.createdAt}
                        title={date.toLocaleString('fr-FR')}
                        className="col-start-2 text-meta whitespace-nowrap text-steel-400 tabular-nums sm:col-start-3"
                      >
                        {heure.format(date)}
                      </time>
                    </li>
                  </Fragment>
                );
              })}
            </ol>
            <Pagination page={data.page} taille={data.taille} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
