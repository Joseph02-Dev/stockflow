import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, Lock, LogIn, SlidersHorizontal, Unlock, X } from 'lucide-react';
import { messageErreur } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { apiConsole } from './api';
import { Pagination } from './Pagination';
import type { ActionAudit, Page } from './types';

interface Entree {
  id: string;
  action: ActionAudit;
  motif: string | null;
  detail: string | null;
  createdAt: string;
  operateur: { id: string; nom: string; email: string };
  entreprise: { id: string; nom: string | null } | null;
}

// Verbes au passé composé avec « avoir » : aucun accord de genre à deviner.
const ACTIONS: Record<ActionAudit, { libelle: string; verbe: string; Icone: typeof Eye; fond: string }> = {
  CONNEXION: { libelle: 'Connexion', verbe: 'a ouvert une session', Icone: LogIn, fond: 'bg-paper text-steel-700' },
  CONSULTATION_ENTREPRISE: { libelle: 'Consultation', verbe: 'a consulté', Icone: Eye, fond: 'bg-console-wash text-console' },
  SUSPENSION: { libelle: 'Suspension', verbe: 'a suspendu l’accès de', Icone: Lock, fond: 'bg-rupture-wash text-rupture' },
  MODIFICATION_REGLAGES: {
    libelle: 'Réglages',
    verbe: 'a modifié les réglages de',
    Icone: SlidersHorizontal,
    fond: 'bg-accent-wash text-accent',
  },
  RETABLISSEMENT: { libelle: 'Rétablissement', verbe: 'a rétabli l’accès de', Icone: Unlock, fond: 'bg-ok-wash text-ok' },
};

const FILTRES: (ActionAudit | 'TOUTES')[] = [
  'TOUTES',
  'SUSPENSION',
  'RETABLISSEMENT',
  'MODIFICATION_REGLAGES',
  'CONSULTATION_ENTREPRISE',
  'CONNEXION',
];

export function ConsoleJournalPage() {
  const [parametres, setParametres] = useSearchParams();
  const entrepriseId = parametres.get('entrepriseId');
  const [action, setAction] = useState<ActionAudit | 'TOUTES'>('TOUTES');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['console', 'journal', entrepriseId, action, page],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), taille: '30' });
      if (entrepriseId) p.set('entrepriseId', entrepriseId);
      if (action !== 'TOUTES') p.set('action', action);
      return (await apiConsole.get<Page<Entree>>(`/console/journal?${p.toString()}`)).data;
    },
    placeholderData: keepPreviousData,
  });

  const nomFiltre = data?.elements.find((e) => e.entreprise?.id === entrepriseId)?.entreprise?.nom;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Journal d’audit"
        description="Chaque connexion, consultation, suspension et rétablissement, avec son auteur."
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTRES.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={action === f}
            onClick={() => {
              setAction(f);
              setPage(1);
            }}
            className={cn(
              'inline-flex h-8 items-center rounded-full border px-3 text-corps whitespace-nowrap transition-colors',
              action === f
                ? 'border-console/30 bg-console-wash font-medium text-console'
                : 'border-rule bg-surface text-steel-700 hover:border-rule-strong',
            )}
          >
            {f === 'TOUTES' ? 'Toutes les actions' : ACTIONS[f].libelle}
          </button>
        ))}
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
            <ol className="divide-y divide-rule">
              {data.elements.map((e) => {
                const a = ACTIONS[e.action];
                return (
                  <li key={e.id} className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-start gap-3 px-5 py-3">
                    <span className={cn('mt-0.5 flex size-[26px] items-center justify-center rounded-sm', a.fond)} aria-hidden="true">
                      <a.Icone className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-corps text-ink-900">
                        <span className="font-semibold">{e.operateur.nom}</span> <span className="text-steel-500">{a.verbe}</span>
                        {!e.entreprise && e.action === 'CONSULTATION_ENTREPRISE' && e.detail && (
                          <span className="text-steel-500"> {e.detail.charAt(0).toLowerCase() + e.detail.slice(1)}</span>
                        )}
                        {e.entreprise && (
                          <>
                            {' '}
                            <Link to={`/console/entreprises/${e.entreprise.id}`} className="font-medium text-console hover:underline">
                              {e.entreprise.nom ?? 'Entreprise disparue'}
                            </Link>
                          </>
                        )}
                      </p>
                      {(e.motif || (e.detail && e.entreprise)) && (
                        <p className="mt-0.5 text-meta text-steel-500">
                          {e.motif && (
                            <span className="mr-2 inline-flex rounded-sm bg-paper px-1.5 text-steel-700">Motif : {e.motif}</span>
                          )}
                          {e.entreprise && e.detail}
                        </p>
                      )}
                    </div>
                    <time dateTime={e.createdAt} className="text-meta whitespace-nowrap text-steel-500">
                      {new Date(e.createdAt).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </li>
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
