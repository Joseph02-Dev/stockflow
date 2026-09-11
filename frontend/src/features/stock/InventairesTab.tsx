import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';

interface Emplacement {
  id: string;
  nom: string;
}

interface Inventaire {
  id: string;
  statut: 'EN_COURS' | 'TERMINE';
  createdAt: string;
  termineAt: string | null;
  emplacement: { nom: string };
  utilisateur: { nom: string };
  _count: { lignes: number };
}

export function InventairesTab({ emplacements }: { emplacements: Emplacement[] | undefined }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [emplacementChoisi, setEmplacementChoisi] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const inventaires = useQuery({
    queryKey: ['inventaires'],
    queryFn: async () => (await api.get<Inventaire[]>('/inventaires')).data,
  });

  const creer = useMutation({
    mutationFn: async () =>
      (await api.post<{ id: string }>('/inventaires', { emplacementId: emplacementChoisi })).data,
    onSuccess: (nouveau) => {
      queryClient.invalidateQueries({ queryKey: ['inventaires'] });
      setModaleOuverte(false);
      navigate(`/inventaires/${nouveau.id}`);
    },
    onError: (err) => setErreur(messageErreur(err, 'La création a échoué.')),
  });

  function ouvrirCreation() {
    setErreur(null);
    setEmplacementChoisi('');
    setModaleOuverte(true);
  }

  const optionsEmplacements = [
    { valeur: '', libelle: 'Sélectionner un emplacement…' },
    ...(emplacements ?? []).map((e) => ({ valeur: e.id, libelle: e.nom })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={ouvrirCreation}>
          <Plus className="size-4" aria-hidden="true" />
          Nouvel inventaire
        </Button>
      </div>

      <Card>
        {inventaires.isLoading ? (
          <LoadingState />
        ) : inventaires.isError ? (
          <ErrorState message={messageErreur(inventaires.error)} onRetry={() => inventaires.refetch()} />
        ) : inventaires.data && inventaires.data.length > 0 ? (
          <ul className="divide-y divide-border-subtle">
            {inventaires.data.map((inv) => (
              <li key={inv.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/inventaires/${inv.id}`)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-background"
                >
                  <div className="flex items-center gap-3">
                    <ClipboardList className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
                    <div>
                      <p className="font-medium text-text-primary">{inv.emplacement.nom}</p>
                      <p className="text-sm text-text-secondary">
                        {inv._count.lignes} produit(s) · {inv.utilisateur.nom} ·{' '}
                        {new Date(inv.createdAt).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <Badge variant={inv.statut === 'EN_COURS' ? 'warning' : 'success'}>
                    {inv.statut === 'EN_COURS' ? 'En cours' : 'Terminé'}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            titre="Aucun inventaire"
            description="Lancez un comptage physique pour vérifier votre stock sur un emplacement."
            action={<Button onClick={ouvrirCreation}>Nouvel inventaire</Button>}
          />
        )}
      </Card>

      <Modal
        ouvert={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        titre="Nouvel inventaire"
        description="Toutes les références actives du catalogue seront à compter sur cet emplacement."
      >
        <div className="flex flex-col gap-4">
          {erreur && <Alert variant="error">{erreur}</Alert>}
          <Select
            label="Emplacement"
            options={optionsEmplacements}
            value={emplacementChoisi}
            onChange={(e) => setEmplacementChoisi(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModaleOuverte(false)}>
              Annuler
            </Button>
            <Button onClick={() => creer.mutate()} loading={creer.isPending} disabled={!emplacementChoisi}>
              Commencer le comptage
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
