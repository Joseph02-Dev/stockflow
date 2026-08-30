import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Plus, X } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { cn } from '@/lib/cn';

interface Fournisseur {
  id: string;
  nom: string;
  emailContact: string | null;
  telephone: string | null;
}

interface Produit {
  id: string;
  nom: string;
  reference: string | null;
}

interface Reception {
  id: string;
  quantite: number;
  createdAt: string;
  produit: { nom: string };
  emplacement: { nom: string };
}

const onglets = [
  { cle: 'informations', libelle: 'Informations' },
  { cle: 'produits', libelle: 'Produits associés' },
  { cle: 'receptions', libelle: 'Réceptions' },
] as const;

type CleOnglet = (typeof onglets)[number]['cle'];

export function FournisseurDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [actif, setActif] = useState<CleOnglet>('informations');
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const fournisseur = useQuery({
    queryKey: ['fournisseur', id],
    queryFn: async () => (await api.get<Fournisseur>(`/fournisseurs/${id}`)).data,
  });

  const produitsAssocies = useQuery({
    queryKey: ['fournisseur', id, 'produits'],
    queryFn: async () => (await api.get<Produit[]>(`/fournisseurs/${id}/produits`)).data,
  });

  const receptions = useQuery({
    queryKey: ['fournisseur', id, 'receptions'],
    queryFn: async () => (await api.get<Reception[]>(`/fournisseurs/${id}/receptions`)).data,
    // Chargé uniquement quand l'onglet est consulté : évite une requête
    // inutile à chaque ouverture de la fiche.
    enabled: actif === 'receptions',
  });

  const catalogue = useQuery({
    queryKey: ['produits', '', false],
    queryFn: async () => (await api.get<Produit[]>('/produits')).data,
    enabled: modaleOuverte,
  });

  const associer = useMutation({
    mutationFn: async (produitId: string) => api.post(`/fournisseurs/${id}/produits`, { produitId }),
    onSuccess: () => {
      setErreur(null);
      queryClient.invalidateQueries({ queryKey: ['fournisseur', id, 'produits'] });
      setModaleOuverte(false);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’association a échoué.')),
  });

  const dissocier = useMutation({
    mutationFn: async (produitId: string) => api.delete(`/fournisseurs/${id}/produits/${produitId}`),
    onSuccess: () => {
      setErreur(null);
      queryClient.invalidateQueries({ queryKey: ['fournisseur', id, 'produits'] });
    },
    onError: (err) => setErreur(messageErreur(err, 'La dissociation a échoué.')),
  });

  if (fournisseur.isLoading) return <LoadingState />;
  if (fournisseur.isError) {
    return (
      <ErrorState
        message={messageErreur(fournisseur.error, 'Fournisseur introuvable.')}
        onRetry={() => fournisseur.refetch()}
      />
    );
  }
  if (!fournisseur.data) return null;

  // Seuls les produits pas encore associés sont proposés.
  const dejaAssocies = new Set((produitsAssocies.data ?? []).map((p) => p.id));
  const produitsDisponibles = (catalogue.data ?? []).filter((p) => !dejaAssocies.has(p.id));

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Fil d’Ariane" className="flex items-center gap-1 text-sm text-text-secondary">
        <Link to="/fournisseurs" className="hover:text-text-primary hover:underline">
          Fournisseurs
        </Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <span className="text-text-primary">{fournisseur.data.nom}</span>
      </nav>

      <h1 className="text-2xl font-semibold text-text-primary">{fournisseur.data.nom}</h1>

      <div className="border-b border-border-subtle" role="tablist" aria-label="Sections du fournisseur">
        <div className="flex gap-1">
          {onglets.map((onglet) => (
            <button
              key={onglet.cle}
              type="button"
              role="tab"
              aria-selected={actif === onglet.cle}
              onClick={() => setActif(onglet.cle)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                actif === onglet.cle
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary',
              )}
            >
              {onglet.libelle}
            </button>
          ))}
        </div>
      </div>

      {erreur && <Alert variant="error">{erreur}</Alert>}

      <div role="tabpanel">
        {actif === 'informations' && (
          <Card>
            <dl className="divide-y divide-border-subtle">
              <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-text-secondary">Email de contact</dt>
                <dd className="text-text-primary">{fournisseur.data.emailContact ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-text-secondary">Téléphone</dt>
                <dd className="text-text-primary">{fournisseur.data.telephone ?? '—'}</dd>
              </div>
            </dl>
          </Card>
        )}

        {actif === 'produits' && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <Button onClick={() => setModaleOuverte(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Associer un produit
              </Button>
            </div>

            <Card>
              {produitsAssocies.isLoading ? (
                <LoadingState />
              ) : produitsAssocies.data && produitsAssocies.data.length > 0 ? (
                <ul className="divide-y divide-border-subtle">
                  {produitsAssocies.data.map((produit) => (
                    <li key={produit.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-primary">{produit.nom}</p>
                        {produit.reference && (
                          <p className="truncate text-sm text-text-secondary">{produit.reference}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => dissocier.mutate(produit.id)}
                        disabled={dissocier.isPending}
                      >
                        <X className="size-4" aria-hidden="true" />
                        <span className="sr-only sm:not-sr-only">Dissocier</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  titre="Aucun produit associé"
                  description="Associez les produits que ce fournisseur vous livre."
                  action={<Button onClick={() => setModaleOuverte(true)}>Associer un produit</Button>}
                />
              )}
            </Card>
          </div>
        )}

        {actif === 'receptions' && (
          <Card>
            {receptions.isLoading ? (
              <LoadingState />
            ) : receptions.isError ? (
              <ErrorState message={messageErreur(receptions.error)} onRetry={() => receptions.refetch()} />
            ) : receptions.data && receptions.data.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="border-b border-border-subtle bg-background text-left">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Date</th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Produit</th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Emplacement</th>
                    <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Quantité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {receptions.data.map((reception) => (
                    <tr key={reception.id}>
                      <td className="px-4 py-3 text-text-secondary">
                        {new Date(reception.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 font-medium text-text-primary">{reception.produit.nom}</td>
                      <td className="px-4 py-3 text-text-secondary">{reception.emplacement.nom}</td>
                      <td className="px-4 py-3">
                        <Badge variant="success">+{reception.quantite}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState
                titre="Aucune réception"
                description="Les entrées de stock enregistrées avec ce fournisseur apparaîtront ici."
              />
            )}
          </Card>
        )}
      </div>

      <Modal
        ouvert={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        titre="Associer un produit"
        description="Seuls les produits pas encore associés sont proposés."
      >
        {catalogue.isLoading ? (
          <LoadingState />
        ) : produitsDisponibles.length > 0 ? (
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {produitsDisponibles.map((produit) => (
              <li key={produit.id}>
                <button
                  type="button"
                  onClick={() => associer.mutate(produit.id)}
                  disabled={associer.isPending}
                  className="flex w-full items-center justify-between gap-3 rounded-(--radius-button) px-3 py-2 text-left text-sm transition-colors hover:bg-background disabled:opacity-50"
                >
                  <span className="truncate text-text-primary">{produit.nom}</span>
                  {produit.reference && (
                    <span className="shrink-0 text-xs text-text-secondary">{produit.reference}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-text-secondary">
            Tous vos produits sont déjà associés à ce fournisseur.
          </p>
        )}
      </Modal>
    </div>
  );
}
