import { useQuery } from '@tanstack/react-query';
import { api, messageErreur } from '@/lib/api';
import { dateHeure } from '@/lib/montant';
import { cn } from '@/lib/cn';
import { trajetMouvement, type NatureEmplacement } from '@/lib/natureEmplacement';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, LoadingState } from '@/components/patterns/States';
import { libelleMouvement, presentationMouvement, quantiteSignee, type TypeMouvement } from '@/components/patterns/typeMouvement';

interface MouvementLot {
  id: string;
  type: TypeMouvement;
  quantite: number;
  origine: NatureEmplacement;
  destination: NatureEmplacement;
  createdAt: string;
  emplacement: { nom: string };
  emplacementDestination: { nom: string } | null;
  utilisateur: { nom: string };
  fournisseur: { nom: string } | null;
  vente: { numero: string } | null;
}

/**
 * Traçabilité d'un lot ou d'un numéro de série : d'où il vient, où il est
 * passé, à qui il a été vendu — tous ses mouvements, du plus ancien au
 * plus récent, quel que soit l'emplacement.
 */
export function HistoriqueLot({ produitId, numero, onFermer }: { produitId: string; numero: string; onFermer: () => void }) {
  const historique = useQuery({
    queryKey: ['lots', produitId, 'historique', numero],
    queryFn: async () =>
      (await api.get<MouvementLot[]>(`/produits/${produitId}/tracabilite?numero=${encodeURIComponent(numero)}`)).data,
  });

  return (
    <Modal ouvert onFermer={onFermer} titre={`Historique de ${numero}`} description="Tous les mouvements de ce lot, dans l’ordre.">
      {historique.isLoading ? (
        <LoadingState lignes={3} />
      ) : historique.isError ? (
        <ErrorState message={messageErreur(historique.error)} onRetry={() => historique.refetch()} />
      ) : (
        <ol className="flex flex-col gap-3">
          {historique.data!.map((m) => {
            const { Icone, fond, couleur } = presentationMouvement[m.type];
            return (
              <li key={m.id} className="flex items-start gap-3">
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', fond)}>
                  <Icone className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-corps font-medium text-ink-900">
                    {libelleMouvement(m)}
                    {m.fournisseur && <span className="font-normal text-steel-500"> de {m.fournisseur.nom}</span>}
                  </span>
                  <span className="block text-meta text-steel-500">
                    {trajetMouvement(m)} · {dateHeure(m.createdAt)} · {m.utilisateur.nom}
                  </span>
                </span>
                <span className={cn('shrink-0 text-corps font-semibold', couleur)}>
                  {quantiteSignee(m.type, m.quantite)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
