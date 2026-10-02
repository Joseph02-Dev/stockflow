import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { dateCourte, dateHeure, gnf } from '@/lib/montant';
import { pluriel } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { MODES } from './modes';
import type { VenteResume } from './types';

const LIEN_NOUVELLE =
  'inline-flex h-9 items-center gap-2 rounded-md bg-action px-3.5 text-corps font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] hover:bg-action-dark';

function Statut({ vente }: { vente: VenteResume }) {
  if (vente.statut === 'ANNULEE') return <Badge variant="rupture">Annulée</Badge>;
  if (vente.resteDu > 0) return <Badge variant="faible">Reste {gnf(vente.resteDu)}</Badge>;
  return <Badge variant="ok">Réglée</Badge>;
}

export function VentesPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ventes', 'liste'],
    queryFn: async () => (await api.get<VenteResume[]>('/ventes')).data,
  });
  const ventes = data ?? [];

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
            <PanneauEntete titre={`${ventes.length} ${pluriel('vente', ventes.length)}`} meta="Les plus récentes d’abord" />
            <ul className="divide-y divide-rule">
              {ventes.map((v) => (
                <li key={v.id}>
                  <Link
                    to={`/ventes/${v.id}`}
                    className={cn('flex items-center gap-3 px-4 py-3 transition-colors hover:bg-entete-tableau sm:px-5', v.statut === 'ANNULEE' && 'opacity-70')}
                  >
                    <span className={cn('size-2 shrink-0 rounded-full', MODES[v.modePaiement].point)} title={MODES[v.modePaiement].libelle} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-corps font-medium text-ink-900">{v.client?.nom ?? 'Client de passage'}</p>
                      <p className="truncate text-meta text-steel-500">
                        <span className="font-mono whitespace-nowrap">{v.numero}</span> ·{' '}
                        <span className="sm:hidden">{dateCourte(v.createdAt)}</span>
                        <span className="hidden sm:inline">{dateHeure(v.createdAt)}</span>
                        <span className="hidden sm:inline">
                          {' '}
                          · {v.nombreLignes} {pluriel('article', v.nombreLignes)} · {MODES[v.modePaiement].libelle}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={cn('text-corps font-semibold text-ink-900', v.statut === 'ANNULEE' && 'line-through')}>{gnf(v.total)}</span>
                      <Statut vente={v} />
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-steel-400" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
