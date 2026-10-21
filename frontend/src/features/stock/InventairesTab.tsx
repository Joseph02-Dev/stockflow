import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Selecteur } from '@/components/ui/Selecteur';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import type { Emplacement } from './types';

interface Inventaire {
  id: string;
  statut: 'EN_COURS' | 'TERMINE';
  createdAt: string;
  termineAt: string | null;
  emplacement: { nom: string };
  utilisateur: { nom: string };
  _count: { lignes: number };
}

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Onglet « Inventaires » : comptages physiques en cartes, limités à
 * l'emplacement choisi en haut de page (tous sinon). La création propose
 * cet emplacement par défaut.
 */
export function InventairesTab({
  emplacements,
  emplacementId,
}: {
  emplacements: Emplacement[] | undefined;
  /** Emplacement choisi en haut de page ; '' = tous. */
  emplacementId: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [emplacementChoisi, setEmplacementChoisi] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const inventaires = useQuery({
    queryKey: ['inventaires', emplacementId],
    queryFn: async () =>
      (await api.get<Inventaire[]>(`/inventaires${emplacementId ? `?emplacement_id=${emplacementId}` : ''}`)).data,
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
    setEmplacementChoisi(emplacementId);
    setModaleOuverte(true);
  }

  const optionsEmplacements = (emplacements ?? []).map((e) => ({ valeur: e.id, libelle: e.chemin ?? e.nom }));

  return (
    <div className="flex flex-col gap-4">
      {inventaires.isLoading ? (
        <Card>
          <LoadingState />
        </Card>
      ) : inventaires.isError ? (
        <Card>
          <ErrorState message={messageErreur(inventaires.error)} onRetry={() => inventaires.refetch()} />
        </Card>
      ) : inventaires.data && inventaires.data.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li className="flex">
            <button type="button" onClick={ouvrirCreation} className="stock-inventaire stock-inventaire-nouveau flex-1">
              <span className="flex size-[38px] items-center justify-center rounded-[10px] bg-action-wash text-action" aria-hidden="true">
                <Plus className="size-[18px]" />
              </span>
              <span className="text-corps font-semibold text-ink-900">Nouvel inventaire</span>
              <span className="text-meta text-steel-500">
                Choisissez un emplacement, comptez, validez : les écarts deviennent des ajustements.
              </span>
            </button>
          </li>
          {inventaires.data.map((inv, rang) => {
            const enCours = inv.statut === 'EN_COURS';
            return (
              <li key={inv.id} className="flex">
                <button
                  type="button"
                  onClick={() => navigate(`/inventaires/${inv.id}`)}
                  className="stock-inventaire stock-apparition flex-1"
                  style={{ animationDelay: `${Math.min(rang + 1, 12) * 50}ms` }}
                >
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="truncate font-display text-[1rem] font-semibold tracking-[-0.01em] text-ink-900">
                      {inv.emplacement.nom}
                    </span>
                    <Badge variant={enCours ? 'action' : 'ok'}>{enCours ? 'En cours' : 'Terminé'}</Badge>
                  </span>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-meta">
                    <dt className="text-steel-400">Démarré</dt>
                    <dd className="text-steel-700">{dateHeure(inv.createdAt)}</dd>
                    {inv.termineAt && (
                      <>
                        <dt className="text-steel-400">Terminé</dt>
                        <dd className="text-steel-700">{dateHeure(inv.termineAt)}</dd>
                      </>
                    )}
                    <dt className="text-steel-400">Par</dt>
                    <dd className="text-steel-700">{inv.utilisateur.nom}</dd>
                    <dt className="text-steel-400">Produits</dt>
                    <dd className="text-steel-700">
                      {inv._count.lignes} {inv._count.lignes > 1 ? 'produits' : 'produit'} à compter
                    </dd>
                  </dl>
                  <span className="mt-auto text-meta font-semibold text-action">
                    {enCours ? 'Reprendre le comptage →' : 'Voir le détail →'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <EmptyState
            titre="Aucun inventaire"
            description="Lancez un comptage physique pour vérifier votre stock sur un emplacement."
            action={<Button onClick={ouvrirCreation}>Nouvel inventaire</Button>}
          />
        </Card>
      )}

      <Modal
        ouvert={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        titre="Nouvel inventaire"
        modifie={emplacementChoisi !== ''}
        description="Toutes les références actives du catalogue seront à compter sur cet emplacement."
        pied={
          <>
            <Button variant="secondary" onClick={() => setModaleOuverte(false)}>
              Annuler
            </Button>
            <Button onClick={() => creer.mutate()} loading={creer.isPending} disabled={!emplacementChoisi}>
              Commencer le comptage
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erreur && <Alert variant="error">{erreur}</Alert>}
          <Selecteur
            label="Emplacement"
            placeholder="Sélectionner un emplacement…"
            options={optionsEmplacements}
            value={emplacementChoisi}
            onChange={setEmplacementChoisi}
          />
        </div>
      </Modal>
    </div>
  );
}
