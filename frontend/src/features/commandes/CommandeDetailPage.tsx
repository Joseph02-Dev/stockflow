import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Send, PackageCheck, X } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/patterns/Page';
import { ErrorState, LoadingState } from '@/components/patterns/States';

interface Ligne {
  id: string;
  produitId: string;
  quantiteCommandee: number;
  produit: { nom: string; reference: string | null; uniteMesure: string | null };
}

interface CommandeDetail {
  id: string;
  statut: 'BROUILLON' | 'ENVOYEE' | 'RECUE' | 'ANNULEE';
  createdAt: string;
  envoyeeAt: string | null;
  recueAt: string | null;
  fournisseur: { id: string; nom: string };
  emplacement: { id: string; nom: string };
  lignes: Ligne[];
}

const STATUTS: Record<
  CommandeDetail['statut'],
  { libelle: string; variant: 'neutral' | 'warning' | 'success' | 'error' }
> = {
  BROUILLON: { libelle: 'Brouillon', variant: 'neutral' },
  ENVOYEE: { libelle: 'Envoyée', variant: 'warning' },
  RECUE: { libelle: 'Reçue', variant: 'success' },
  ANNULEE: { libelle: 'Annulée', variant: 'error' },
};

export function CommandeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<'envoyer' | 'recevoir' | 'annuler' | null>(null);

  const commande = useQuery({
    queryKey: ['commande', id],
    queryFn: async () => (await api.get<CommandeDetail>(`/commandes/${id}`)).data,
  });

  function invaliderTout() {
    queryClient.invalidateQueries({ queryKey: ['commande', id] });
    queryClient.invalidateQueries({ queryKey: ['commandes'] });
    queryClient.invalidateQueries({ queryKey: ['stock'] });
    queryClient.invalidateQueries({ queryKey: ['mouvements'] });
    queryClient.invalidateQueries({ queryKey: ['alertes'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  const envoyer = useMutation({
    mutationFn: async () => api.post(`/commandes/${id}/envoyer`),
    onSuccess: () => {
      invaliderTout();
      setConfirmation(null);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’envoi a échoué.')),
  });

  const recevoir = useMutation({
    mutationFn: async () => api.post(`/commandes/${id}/recevoir`),
    onSuccess: () => {
      invaliderTout();
      setConfirmation(null);
    },
    onError: (err) => setErreur(messageErreur(err, 'La réception a échoué.')),
  });

  const annuler = useMutation({
    mutationFn: async () => api.post(`/commandes/${id}/annuler`),
    onSuccess: () => {
      invaliderTout();
      setConfirmation(null);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’annulation a échoué.')),
  });

  if (commande.isLoading) return <LoadingState />;
  if (commande.isError || !commande.data) {
    return (
      <ErrorState
        message={messageErreur(commande.error, 'Commande introuvable.')}
        onRetry={() => commande.refetch()}
      />
    );
  }

  const data = commande.data;

  const actionsParStatut: Record<CommandeDetail['statut'], { label: string; type: NonNullable<typeof confirmation> }[]> = {
    BROUILLON: [{ label: 'Envoyer la commande', type: 'envoyer' }],
    ENVOYEE: [{ label: 'Marquer comme reçue', type: 'recevoir' }],
    RECUE: [],
    ANNULEE: [],
  };
  const peutAnnuler = data.statut === 'BROUILLON' || data.statut === 'ENVOYEE';

  const executerConfirmation = () => {
    if (confirmation === 'envoyer') envoyer.mutate();
    if (confirmation === 'recevoir') recevoir.mutate();
    if (confirmation === 'annuler') annuler.mutate();
  };

  const texteConfirmation: Record<NonNullable<typeof confirmation>, { titre: string; description: string }> = {
    envoyer: {
      titre: 'Envoyer cette commande ?',
      description: 'Les lignes ne seront plus modifiables une fois la commande envoyée.',
    },
    recevoir: {
      titre: 'Marquer cette commande comme reçue ?',
      description: `Une entrée de stock sera créée pour chaque ligne, à l’emplacement « ${data.emplacement.nom} ». Cette action est irréversible.`,
    },
    annuler: {
      titre: 'Annuler cette commande ?',
      description: 'Cette action est définitive.',
    },
  };

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Fil d’Ariane" className="flex items-center gap-1 text-sm text-text-secondary">
        <Link to="/commandes" className="hover:text-text-primary hover:underline">
          Commandes fournisseur
        </Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <span className="text-text-primary">{data.fournisseur.nom}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{data.fournisseur.nom}</h1>
          <p className="text-sm text-text-secondary">
            Réception à « {data.emplacement.nom} » · créée le {new Date(data.createdAt).toLocaleDateString('fr-FR')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUTS[data.statut].variant}>{STATUTS[data.statut].libelle}</Badge>
          {actionsParStatut[data.statut].map((action) => (
            <Button key={action.type} onClick={() => setConfirmation(action.type)}>
              {action.type === 'envoyer' ? (
                <Send className="size-4" aria-hidden="true" />
              ) : (
                <PackageCheck className="size-4" aria-hidden="true" />
              )}
              {action.label}
            </Button>
          ))}
          {peutAnnuler && (
            <Button variant="ghost" onClick={() => setConfirmation('annuler')}>
              <X className="size-4" aria-hidden="true" />
              Annuler
            </Button>
          )}
        </div>
      </div>

      {erreur && <Alert variant="error">{erreur}</Alert>}

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b border-border-subtle bg-background text-left">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Produit</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Quantité commandée</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {data.lignes.map((ligne) => (
              <tr key={ligne.id}>
                <td className="px-4 py-3">
                  <span className="font-medium text-text-primary">{ligne.produit.nom}</span>
                  {ligne.produit.reference && (
                    <span className="ml-2 text-xs text-text-secondary">{ligne.produit.reference}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {ligne.quantiteCommandee}
                  {ligne.produit.uniteMesure ? ` ${ligne.produit.uniteMesure.toLowerCase()}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal
        ouvert={confirmation !== null}
        onFermer={() => setConfirmation(null)}
        titre={confirmation ? texteConfirmation[confirmation].titre : ''}
        description={confirmation ? texteConfirmation[confirmation].description : undefined}
        pied={
          <>
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              Annuler
            </Button>
            <Button
              variant={confirmation === 'annuler' ? 'danger' : 'primary'}
              loading={envoyer.isPending || recevoir.isPending || annuler.isPending}
              onClick={executerConfirmation}
            >
              Confirmer
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">{data.lignes.length} référence(s) concernée(s).</p>
      </Modal>
    </div>
  );
}
