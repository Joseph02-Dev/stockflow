import { useQuery } from '@tanstack/react-query';
import { Pagination } from '@/components/patterns/Pagination';
import { usePagination } from '@/components/patterns/usePagination';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { pluriel } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import type { Modele } from './modeles';

/** Modèles à variantes (module « variantes ») : T-shirt × Couleur × Taille. */
export function ModelesPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['modeles'],
    queryFn: async () => (await api.get<Modele[]>('/modeles')).data,
  });
  const { visibles, ancre, pagination } = usePagination(data ?? []);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Modèles à variantes"
        description="Un modèle décliné en tailles, couleurs… : chaque combinaison devient un produit avec son propre stock."
        action={
          <>
            <Button variant="secondary" onClick={() => navigate('/produits')}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Produits
            </Button>
            <Button onClick={() => navigate('/produits/modeles/nouveau')}>
              <Plus className="size-4" aria-hidden="true" />
              Nouveau modèle
            </Button>
          </>
        }
      />
      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : data && data.length > 0 ? (
          <>
            <div ref={ancre} className="scroll-mt-20" />
            <ul className="divide-y divide-rule">
              {visibles.map((modele) => {
                const nombre = modele._count?.variantes ?? 0;
                return (
                  <li key={modele.id}>
                    <Link
                      to={`/produits/modeles/${modele.id}`}
                      className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-entete-tableau sm:px-5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-corps font-medium text-ink-900">{modele.nom}</span>
                        <span className="block truncate text-meta text-steel-500">
                          {modele.attributs.map((a) => `${a.nom} : ${a.valeurs.join(', ')}`).join(' · ')}
                        </span>
                      </span>
                      <span className="shrink-0 text-meta text-steel-500">
                        {nombre} {pluriel('variante', nombre)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Pagination etat={pagination} className="border-t border-rule" />
          </>
        ) : (
          <EmptyState
            titre="Aucun modèle"
            description="Créez un modèle, choisissez ses tailles et couleurs : les variantes sont générées automatiquement."
            action={<Button onClick={() => navigate('/produits/modeles/nouveau')}>Créer un modèle</Button>}
          />
        )}
      </Card>
    </div>
  );
}
