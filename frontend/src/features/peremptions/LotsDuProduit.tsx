import { useQuery } from '@tanstack/react-query';
import { api, messageErreur } from '@/lib/api';
import { dateCourte } from '@/lib/montant';
import { formatNombre } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, LoadingState } from '@/components/patterns/States';
import { TRANCHES, datePeremption, libelleJours, trancheDe } from './presentation';
import type { LotProduit } from './types';

/**
 * Bloc « Lots en stock » de la fiche produit : par emplacement, dans
 * l'ordre où les ventes les sortiront (FEFO).
 */
export function LotsDuProduit({ produitId }: { produitId: string }) {
  const lots = useQuery({
    queryKey: ['lots', produitId],
    queryFn: async () => (await api.get<LotProduit[]>(`/produits/${produitId}/lots`)).data,
  });

  return (
    <div className="flex flex-col gap-2 border-t border-rule pt-4">
      <p className="text-corps font-medium text-ink-900">Lots en stock</p>
      {lots.isLoading ? (
        <LoadingState lignes={3} />
      ) : lots.isError ? (
        <ErrorState message={messageErreur(lots.error)} onRetry={() => lots.refetch()} />
      ) : lots.data!.length === 0 ? (
        <p className="text-corps text-steel-500">Aucun lot en stock : la prochaine réception en créera un.</p>
      ) : (
        <ul className="divide-y divide-rule rounded-md border border-rule">
          {lots.data!.map((lot) => (
            <li key={lot.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-corps text-ink-900">{lot.numero}</span>
                  {lot.sortiraEnPremier && <Badge variant="ok">Sortira en premier</Badge>}
                </p>
                <p className="text-meta text-steel-500">
                  {lot.emplacement.nom} · reçu le {dateCourte(lot.recuAt)}
                </p>
              </div>
              <span className="text-corps font-semibold text-ink-900">{formatNombre(lot.quantite)}</span>
              <div className="min-w-[104px] text-right">
                {lot.datePeremption && lot.joursRestants !== null ? (
                  <>
                    <p className={cn('text-corps font-medium', TRANCHES[trancheDe(lot.joursRestants)].texte)}>
                      {libelleJours(lot.joursRestants)}
                    </p>
                    <p className="text-meta text-steel-500">{datePeremption(lot.datePeremption)}</p>
                  </>
                ) : (
                  <p className="text-meta text-steel-500">Sans date</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
