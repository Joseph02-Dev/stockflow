import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, messageErreur } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';

interface Overview {
  kpi: {
    produitsActifs: number;
    emplacementsActifs: number;
    alertesActives: number;
    mouvements7Jours: number;
    quantiteTotaleEnStock: number;
  };
  produitsEnAlerte: {
    alerteId: string;
    produitId: string;
    produitNom: string;
    type: 'STOCK_FAIBLE' | 'RUPTURE';
    quantiteAuDeclenchement: number;
    seuilAlerte: number;
  }[];
}

function KpiCard({ libelle, valeur }: { libelle: string; valeur: number }) {
  return (
    <div className="rounded-(--radius-card) border border-border-subtle bg-surface p-4 shadow-sm">
      <p className="text-sm text-text-secondary">{libelle}</p>
      <p className="mt-1 text-2xl font-semibold text-text-primary">{valeur}</p>
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<Overview>('/dashboard/overview')).data,
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text-primary">Vue d’ensemble</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard libelle="Produits actifs" valeur={data.kpi.produitsActifs} />
        <KpiCard libelle="Emplacements" valeur={data.kpi.emplacementsActifs} />
        <KpiCard libelle="Alertes actives" valeur={data.kpi.alertesActives} />
        <KpiCard libelle="Mouvements (7 jours)" valeur={data.kpi.mouvements7Jours} />
      </div>

      <section className="rounded-(--radius-card) border border-border-subtle bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="font-medium text-text-primary">Produits en alerte</h2>
          <Link to="/alertes" className="text-sm font-medium text-primary hover:underline">
            Voir toutes les alertes
          </Link>
        </div>

        {data.produitsEnAlerte.length === 0 ? (
          <EmptyState
            titre="Aucune alerte"
            description="Tous vos produits sont au-dessus de leur seuil. Rien à signaler."
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {data.produitsEnAlerte.map((alerte) => (
              <li key={alerte.alerteId} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{alerte.produitNom}</p>
                  <p className="text-sm text-text-secondary">
                    {alerte.quantiteAuDeclenchement} en stock · seuil {alerte.seuilAlerte}
                  </p>
                </div>
                <Badge variant={alerte.type === 'RUPTURE' ? 'error' : 'warning'}>
                  {alerte.type === 'RUPTURE' ? 'Rupture' : 'Stock faible'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
