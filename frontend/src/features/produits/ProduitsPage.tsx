import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, Download, Pencil, Plus, Search } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { exporterCsv } from '@/lib/exporterCsv';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { useDebounce } from '@/lib/useDebounce';

interface Produit {
  id: string;
  nom: string;
  reference: string | null;
  seuilAlerte: number;
  archive: boolean;
  photoUrl: string | null;
  prixVente: number | null;
  uniteMesure: string | null;
  categorie: { nom: string } | null;
  marque: { nom: string } | null;
}

const FORMATEUR_GNF = new Intl.NumberFormat('fr-FR');

export function ProduitsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [recherche, setRecherche] = useState('');
  const [afficherArchives, setAfficherArchives] = useState(false);
  const [aArchiver, setAArchiver] = useState<Produit | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const rechercheRetardee = useDebounce(recherche);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['produits', rechercheRetardee, afficherArchives],
    queryFn: async () => {
      const parametres = new URLSearchParams();
      if (rechercheRetardee) parametres.set('search', rechercheRetardee);
      if (afficherArchives) parametres.set('archive', 'true');
      return (await api.get<Produit[]>(`/produits?${parametres.toString()}`)).data;
    },
  });

  const archiver = useMutation({
    mutationFn: async (id: string) => api.patch(`/produits/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produits'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setAArchiver(null);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’archivage a échoué.')),
  });

  const rechercheActive = rechercheRetardee.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titre="Produits"
        description="Votre catalogue et les seuils d’alerte associés."
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={!data || data.length === 0}
              onClick={() =>
                data &&
                exporterCsv(
                  `produits-${new Date().toISOString().slice(0, 10)}.csv`,
                  [
                    { entete: 'Nom', valeur: (p: Produit) => p.nom },
                    { entete: 'Référence', valeur: (p: Produit) => p.reference ?? '' },
                    { entete: 'Catégorie', valeur: (p: Produit) => p.categorie?.nom ?? '' },
                    { entete: 'Marque', valeur: (p: Produit) => p.marque?.nom ?? '' },
                    { entete: 'Prix de vente (GNF)', valeur: (p: Produit) => p.prixVente ?? '' },
                    { entete: 'Seuil d’alerte', valeur: (p: Produit) => p.seuilAlerte },
                    { entete: 'Statut', valeur: (p: Produit) => (p.archive ? 'Archivé' : 'Actif') },
                  ],
                  data,
                )
              }
            >
              <Download className="size-4" aria-hidden="true" />
              Exporter CSV
            </Button>
            <Button onClick={() => navigate('/produits/nouveau')}>
              <Plus className="size-4" aria-hidden="true" />
              Nouveau produit
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary"
            aria-hidden="true"
          />
          <input
            type="search"
            value={recherche}
            onChange={(event) => setRecherche(event.target.value)}
            placeholder="Rechercher un produit…"
            aria-label="Rechercher un produit"
            className="w-full rounded-(--radius-button) border border-border-subtle bg-surface py-2 pr-3 pl-9 text-sm text-text-primary placeholder:text-text-secondary"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={afficherArchives}
            onChange={(event) => setAfficherArchives(event.target.checked)}
          />
          Afficher les produits archivés
        </label>
      </div>

      {erreur && <Alert variant="error">{erreur}</Alert>}

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : data && data.length > 0 ? (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-border-subtle bg-background text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium text-text-secondary"></th>
                  <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Nom</th>
                  <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Catégorie / Marque</th>
                  <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Prix de vente</th>
                  <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Seuil d’alerte</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {data.map((produit) => (
                  <tr key={produit.id} className="group">
                    <td className="px-4 py-3">
                      <Link
                        to={`/produits/${produit.id}`}
                        className="flex size-10 items-center justify-center overflow-hidden rounded-(--radius-button) bg-background"
                      >
                        {produit.photoUrl ? (
                          <img src={produit.photoUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/produits/${produit.id}`} className="hover:underline">
                        <span className="font-medium text-text-primary">{produit.nom}</span>
                        {produit.reference && (
                          <span className="ml-2 text-xs text-text-secondary">{produit.reference}</span>
                        )}
                      </Link>
                      {produit.archive && (
                        <span className="ml-2">
                          <Badge variant="neutral">Archivé</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {[produit.categorie?.nom, produit.marque?.nom].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {produit.prixVente !== null ? `${FORMATEUR_GNF.format(produit.prixVente)} GNF` : '—'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {produit.seuilAlerte}
                      {produit.uniteMesure ? ` ${produit.uniteMesure.toLowerCase()}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => navigate(`/produits/${produit.id}`)}>
                          <Pencil className="size-4" aria-hidden="true" />
                          <span className="sr-only lg:not-sr-only">Modifier</span>
                        </Button>
                        {!produit.archive && (
                          <Button variant="ghost" onClick={() => setAArchiver(produit)}>
                            <Archive className="size-4" aria-hidden="true" />
                            <span className="sr-only lg:not-sr-only">Archiver</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-border-subtle md:hidden">
              {data.map((produit) => (
                <li key={produit.id} className="flex flex-col gap-2 px-4 py-3">
                  <Link to={`/produits/${produit.id}`} className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-button) bg-background">
                        {produit.photoUrl ? (
                          <img src={produit.photoUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-primary">{produit.nom}</p>
                        {produit.reference && (
                          <p className="truncate text-sm text-text-secondary">{produit.reference}</p>
                        )}
                      </div>
                    </div>
                    {produit.archive && <Badge variant="neutral">Archivé</Badge>}
                  </Link>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-text-secondary">
                      Seuil d’alerte : {produit.seuilAlerte}
                      {produit.uniteMesure ? ` ${produit.uniteMesure.toLowerCase()}` : ''}
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" onClick={() => navigate(`/produits/${produit.id}`)}>
                        <Pencil className="size-4" aria-hidden="true" />
                        Modifier
                      </Button>
                      {!produit.archive && (
                        <Button variant="ghost" onClick={() => setAArchiver(produit)}>
                          <Archive className="size-4" aria-hidden="true" />
                          Archiver
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : rechercheActive ? (
          <EmptyState
            titre="Aucun résultat"
            description={`Aucun produit ne correspond à « ${rechercheRetardee} ».`}
            action={
              <Button variant="secondary" onClick={() => setRecherche('')}>
                Effacer la recherche
              </Button>
            }
          />
        ) : (
          <EmptyState
            titre="Aucun produit"
            description="Créez votre premier produit pour commencer à suivre son stock."
            action={<Button onClick={() => navigate('/produits/nouveau')}>Créer un produit</Button>}
          />
        )}
      </Card>

      <Modal
        ouvert={aArchiver !== null}
        onFermer={() => setAArchiver(null)}
        titre="Archiver ce produit ?"
        description={`« ${aArchiver?.nom} » n’apparaîtra plus dans les listes et ne pourra plus faire l’objet de mouvements. Son historique est conservé.`}
        pied={
          <>
            <Button variant="secondary" onClick={() => setAArchiver(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={archiver.isPending}
              onClick={() => aArchiver && archiver.mutate(aArchiver.id)}
            >
              Archiver
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          Vous pourrez le retrouver en cochant « Afficher les produits archivés ».
        </p>
      </Modal>
    </div>
  );
}
