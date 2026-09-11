import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';

interface Commande {
  id: string;
  statut: 'BROUILLON' | 'ENVOYEE' | 'RECUE' | 'ANNULEE';
  createdAt: string;
  fournisseur: { nom: string };
  emplacement: { nom: string };
  utilisateur: { nom: string };
  _count: { lignes: number };
}

const STATUTS: Record<Commande['statut'], { libelle: string; variant: 'neutral' | 'warning' | 'success' | 'error' }> =
  {
    BROUILLON: { libelle: 'Brouillon', variant: 'neutral' },
    ENVOYEE: { libelle: 'Envoyée', variant: 'warning' },
    RECUE: { libelle: 'Reçue', variant: 'success' },
    ANNULEE: { libelle: 'Annulée', variant: 'error' },
  };

export function CommandesPage() {
  const navigate = useNavigate();

  const commandes = useQuery({
    queryKey: ['commandes'],
    queryFn: async () => (await api.get<Commande[]>('/commandes')).data,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titre="Commandes fournisseur"
        description="Suivi des bons de commande, de la préparation à la réception."
        action={
          <Button onClick={() => navigate('/commandes/nouvelle')}>
            <Plus className="size-4" aria-hidden="true" />
            Nouvelle commande
          </Button>
        }
      />

      <Card>
        {commandes.isLoading ? (
          <LoadingState />
        ) : commandes.isError ? (
          <ErrorState message={messageErreur(commandes.error)} onRetry={() => commandes.refetch()} />
        ) : commandes.data && commandes.data.length > 0 ? (
          <ul className="divide-y divide-border-subtle">
            {commandes.data.map((commande) => (
              <li key={commande.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/commandes/${commande.id}`)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-background"
                >
                  <div className="flex items-center gap-3">
                    <ClipboardList className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
                    <div>
                      <p className="font-medium text-text-primary">{commande.fournisseur.nom}</p>
                      <p className="text-sm text-text-secondary">
                        {commande.emplacement.nom} · {commande._count.lignes} référence(s) ·{' '}
                        {commande.utilisateur.nom} · {new Date(commande.createdAt).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <Badge variant={STATUTS[commande.statut].variant}>{STATUTS[commande.statut].libelle}</Badge>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            titre="Aucune commande"
            description="Créez un bon de commande manuellement, ou depuis les produits en alerte."
            action={<Button onClick={() => navigate('/commandes/nouvelle')}>Nouvelle commande</Button>}
          />
        )}
      </Card>
    </div>
  );
}
