import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Send, PackageCheck, X } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { tableau } from '@/components/patterns/tableau';
import { cn } from '@/lib/cn';
import { pluriel } from '@/lib/format';
import { STATUTS_COMMANDE } from './statutsCommande';
import type { StatutCommande } from './statutsCommande';
import { ErrorState, LoadingState } from '@/components/patterns/States';

interface Ligne {
  id: string;
  produitId: string;
  quantiteCommandee: number;
  produit: { nom: string; reference: string | null; uniteMesure: string | null };
}

interface CommandeDetail {
  id: string;
  statut: StatutCommande;
  createdAt: string;
  envoyeeAt: string | null;
  recueAt: string | null;
  fournisseur: { id: string; nom: string };
  emplacement: { id: string; nom: string };
  lignes: Ligne[];
}


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

  const dateCourte = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : null);
  // Jalons du bon de commande : on voit où il en est sans lire de statut.
  const etapes =
    data.statut === 'ANNULEE'
      ? [
          { libelle: 'Créée', date: dateCourte(data.createdAt), faite: true },
          { libelle: 'Annulée', date: null, faite: true },
        ]
      : [
          { libelle: 'Créée', date: dateCourte(data.createdAt), faite: true },
          { libelle: 'Envoyée', date: dateCourte(data.envoyeeAt), faite: data.envoyeeAt !== null },
          { libelle: 'Reçue', date: dateCourte(data.recueAt), faite: data.recueAt !== null },
        ];
  const statut = STATUTS_COMMANDE[data.statut];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre={data.fournisseur.nom}
        description={
          <>
            Réception à {data.emplacement.nom}.{' '}
            <Link to={`/fournisseurs/${data.fournisseur.id}`} className="text-action hover:underline">
              Fiche fournisseur
            </Link>
          </>
        }
        action={
          <>
            <Badge variant={statut.variant}>{statut.libelle}</Badge>
            {peutAnnuler && (
              <Button variant="ghost" onClick={() => setConfirmation('annuler')}>
                <X className="size-4" aria-hidden="true" />
                Annuler
              </Button>
            )}
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
          </>
        }
      />

      <ol className="flex items-start" aria-label="Avancement de la commande">
        {etapes.map((etape, index) => (
          <li key={etape.libelle} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center">
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                  etape.faite
                    ? data.statut === 'ANNULEE' && index > 0
                      ? 'border-steel-400 bg-steel-400 text-white'
                      : 'border-action bg-action text-white'
                    : 'border-rule-strong bg-surface',
                )}
                aria-hidden="true"
              >
                {etape.faite && <Check className="size-3" strokeWidth={3} />}
              </span>
              {index < etapes.length - 1 && (
                <span
                  className={cn('mx-2 h-0.5 flex-1 rounded-full', etapes[index + 1].faite ? 'bg-action' : 'bg-rule')}
                  aria-hidden="true"
                />
              )}
            </div>
            <span className="pr-2">
              <span className={cn('block text-corps font-medium', etape.faite ? 'text-ink-900' : 'text-steel-400')}>
                {etape.libelle}
                <span className="sr-only">{etape.faite ? ', fait' : ', à venir'}</span>
              </span>
              <span className="block text-meta text-steel-500">{etape.date ?? (etape.faite ? '' : 'À venir')}</span>
            </span>
          </li>
        ))}
      </ol>

      {erreur && <Alert variant="error">{erreur}</Alert>}

      <Card>
        <PanneauEntete
          titre="Lignes de commande"
          meta={`${data.lignes.length} ${pluriel('référence', data.lignes.length)}`}
        />
        <table className={tableau.table}>
          <thead className={tableau.thead}>
            <tr>
              <th scope="col" className={tableau.th}>Produit</th>
              <th scope="col" className={cn(tableau.th, 'text-right')}>Quantité</th>
            </tr>
          </thead>
          <tbody className={tableau.tbody}>
            {data.lignes.map((ligne) => (
              <tr key={ligne.id}>
                <td className={tableau.td}>
                  <Link to={`/produits/${ligne.produitId}`} className="block truncate font-medium text-ink-900 hover:underline">
                    {ligne.produit.nom}
                  </Link>
                  {ligne.produit.reference && (
                    <span className="block font-mono text-meta text-steel-500">{ligne.produit.reference}</span>
                  )}
                </td>
                <td className={cn(tableau.td, 'text-right whitespace-nowrap')}>
                  <span className="font-semibold text-ink-900">{ligne.quantiteCommandee}</span>
                  {ligne.produit.uniteMesure && (
                    <span className="text-meta text-steel-400"> {ligne.produit.uniteMesure}</span>
                  )}
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
        <p className="text-corps text-steel-500">
          {data.lignes.length} {pluriel('référence', data.lignes.length)} {data.lignes.length > 1 ? 'concernées' : 'concernée'}.
        </p>
      </Modal>
    </div>
  );
}
