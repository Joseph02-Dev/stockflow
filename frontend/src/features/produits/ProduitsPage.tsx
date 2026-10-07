import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, Download, MapPin, Pencil, Plus, Search, Upload } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { exporterCsv } from '@/lib/exporterCsv';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { NiveauStock } from '@/components/patterns/NiveauStock';
import { Vignette } from '@/components/patterns/Vignette';
import { libelleStatut, statutStock, varianteStatut } from '@/components/patterns/statutStock';
import { useDebounce } from '@/lib/useDebounce';
import { cn } from '@/lib/cn';
import { useModules } from '@/lib/useModules';

interface Produit {
  id: string;
  nom: string;
  reference: string | null;
  seuilAlerte: number;
  archive: boolean;
  photoUrl: string | null;
  prixVente: number | null;
  uniteMesure: string | null;
  categorie: { id: string; nom: string } | null;
  marque: { nom: string } | null;
}

interface LigneStock {
  produitId: string;
  quantite: number;
  emplacement: { nom: string };
}

const FORMATEUR_GNF = new Intl.NumberFormat('fr-FR');
const TOUTES = '__toutes__';
const SANS_CATEGORIE = '__sans__';

function EtatProduit({ produit, quantite }: { produit: Produit; quantite: number }) {
  if (produit.archive) return <Badge variant="neutral">Archivé</Badge>;
  const statut = statutStock(quantite, produit.seuilAlerte);
  return <Badge variant={varianteStatut[statut]}>{libelleStatut[statut]}</Badge>;
}

function Emplacements({ noms }: { noms: string[] }) {
  if (noms.length === 0) return <span className="text-steel-400">Aucun</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1" title={noms.join(', ')}>
      <MapPin className="size-3 shrink-0 text-steel-400" aria-hidden="true" />
      <span className="truncate">{noms[0]}</span>
      {noms.length > 1 && (
        <span className="shrink-0 rounded-sm bg-paper px-1 text-meta text-steel-500">+{noms.length - 1}</span>
      )}
    </span>
  );
}

export function ProduitsPage() {
  const navigate = useNavigate();
  const modules = useModules();
  const queryClient = useQueryClient();
  const [recherche, setRecherche] = useState('');
  const [afficherArchives, setAfficherArchives] = useState(false);
  const [aArchiver, setAArchiver] = useState<Produit | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [categorieFiltre, setCategorieFiltre] = useState(TOUTES);

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

  // Stock réparti par emplacement — clé partagée avec l'écran Stock.
  const stock = useQuery({
    queryKey: ['stock', ''],
    queryFn: async () => (await api.get<LigneStock[]>('/stock?')).data,
  });
  const lignesStock = stock.data;
  const parProduit = useMemo(() => {
    const carte = new Map<string, { quantite: number; emplacements: string[] }>();
    for (const ligne of lignesStock ?? []) {
      const courant = carte.get(ligne.produitId) ?? { quantite: 0, emplacements: [] };
      courant.quantite += ligne.quantite;
      if (ligne.quantite > 0) courant.emplacements.push(ligne.emplacement.nom);
      carte.set(ligne.produitId, courant);
    }
    return carte;
  }, [lignesStock]);

  // Pastilles de catégorie dérivées du catalogue affiché : on ne propose
  // jamais un filtre qui mènerait à une liste vide.
  const categories = useMemo(() => {
    const compte = new Map<string, { nom: string; n: number }>();
    for (const produit of data ?? []) {
      const cle = produit.categorie?.id ?? SANS_CATEGORIE;
      const courant = compte.get(cle) ?? { nom: produit.categorie?.nom ?? 'Sans catégorie', n: 0 };
      courant.n += 1;
      compte.set(cle, courant);
    }
    return [...compte.entries()].sort(([a, x], [b, y]) =>
      a === SANS_CATEGORIE ? 1 : b === SANS_CATEGORIE ? -1 : x.nom.localeCompare(y.nom, 'fr'),
    );
  }, [data]);

  const produitsAffiches = (data ?? []).filter(
    (p) => categorieFiltre === TOUTES || (p.categorie?.id ?? SANS_CATEGORIE) === categorieFiltre,
  );

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
  const infosStock = (id: string) => parProduit.get(id) ?? { quantite: 0, emplacements: [] };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Produits"
        description="Votre catalogue, où il se trouve et ce qu’il en reste."
        action={
          <>
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
            {modules.import && (
              <Button variant="secondary" onClick={() => navigate('/produits/import')}>
                <Upload className="size-4" aria-hidden="true" />
                Importer
              </Button>
            )}
            <Button onClick={() => navigate('/produits/nouveau')}>
              <Plus className="size-4" aria-hidden="true" />
              Nouveau produit
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="relative min-w-0 flex-1 basis-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={recherche}
              onChange={(event) => setRecherche(event.target.value)}
              placeholder="Rechercher un produit…"
              aria-label="Rechercher un produit"
              className="h-9 w-full rounded-md border border-rule-strong bg-surface-elevee pr-3 pl-9 text-corps text-ink-900 placeholder:text-steel-400 hover:border-steel-400 focus:border-action"
            />
          </div>

          <label className="flex items-center gap-2 text-corps text-steel-500">
            <input
              type="checkbox"
              checked={afficherArchives}
              onChange={(event) => setAfficherArchives(event.target.checked)}
              className="size-4 accent-action"
            />
            Afficher les produits archivés
          </label>
        </div>

        {categories.length > 1 && (
          // Sur mobile, une seule rangée qui défile plutôt que trois lignes de pastilles.
          <div
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
            role="group"
            aria-label="Filtrer par catégorie"
          >
            {[[TOUTES, { nom: 'Toutes', n: data?.length ?? 0 }] as const, ...categories].map(([cle, { nom, n }]) => {
              const actif = categorieFiltre === cle;
              return (
                <button
                  key={cle}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => setCategorieFiltre(cle)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-corps whitespace-nowrap transition-colors',
                    actif
                      ? 'border-action/30 bg-action-wash font-medium text-action'
                      : 'border-rule bg-surface text-steel-700 hover:border-rule-strong',
                  )}
                >
                  {nom}
                  <span className={cn('text-meta', actif ? 'text-action/70' : 'text-steel-400')}>{n}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {erreur && <Alert variant="error">{erreur}</Alert>}

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : produitsAffiches.length > 0 ? (
          <>
            <div className="relative hidden overflow-x-auto lg:block">
              <table className="w-full text-corps">
                <thead className="border-b border-rule bg-entete-tableau text-left text-meta font-medium text-steel-500">
                  <tr>
                    <th scope="col" className="py-2.5 pr-3 pl-5 font-medium">Référence</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Catégorie</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Emplacements</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Stock</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Prix de vente</th>
                    <th scope="col" className="min-w-[124px] px-3 py-2.5 font-medium">État</th>
                    <th scope="col" className="w-[92px] py-2.5 pr-5 pl-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {produitsAffiches.map((produit) => {
                    const infos = infosStock(produit.id);
                    return (
                      <tr key={produit.id} className="hover:bg-entete-tableau">
                        <td className="py-2.5 pr-3 pl-5">
                          <Link to={`/produits/${produit.id}`} className="group flex min-w-0 items-center gap-3">
                            <Vignette nom={produit.nom} photoUrl={produit.photoUrl} taille={34} />
                            <span className="min-w-0">
                              <span className="block max-w-[300px] truncate font-medium text-ink-900 group-hover:underline">
                                {produit.nom}
                              </span>
                              <span className="block font-mono text-meta text-steel-500">
                                {produit.reference ?? '—'}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-steel-700">
                          {produit.categorie?.nom ?? <span className="text-steel-400">—</span>}
                          {produit.marque && <span className="block text-meta text-steel-400">{produit.marque.nom}</span>}
                        </td>
                        <td className="max-w-[180px] px-3 py-2.5 text-steel-700">
                          <Emplacements noms={infos.emplacements} />
                        </td>
                        <td className="px-3 py-2.5">
                          <NiveauStock
                            quantite={infos.quantite}
                            seuil={produit.seuilAlerte}
                            unite={produit.uniteMesure}
                            alignement="droite"
                            className="ml-auto w-[124px]"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {produit.prixVente !== null ? (
                            <>
                              <span className="font-medium text-ink-900">{FORMATEUR_GNF.format(produit.prixVente)}</span>{' '}
                              <span className="text-meta text-steel-400">GNF</span>
                            </>
                          ) : (
                            <span className="text-steel-400">—</span>
                          )}
                        </td>
                        <td className="min-w-[124px] px-3 py-2.5">
                          <EtatProduit produit={produit} quantite={infos.quantite} />
                        </td>
                        <td className="py-2.5 pr-5 pl-3">
                          <div className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              taille="sm"
                              icone
                              aria-label={`Modifier ${produit.nom}`}
                              title="Modifier"
                              onClick={() => navigate(`/produits/${produit.id}`)}
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </Button>
                            {!produit.archive && (
                              <Button
                                variant="ghost"
                                taille="sm"
                              icone
                                aria-label={`Archiver ${produit.nom}`}
                                title="Archiver"
                                onClick={() => setAArchiver(produit)}
                              >
                                <Archive className="size-4" aria-hidden="true" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Fiches empilées sous lg : un tableau à 7 colonnes ne se lit pas sur un écran étroit. */}
            <ul className="divide-y divide-rule lg:hidden">
              {produitsAffiches.map((produit) => {
                const infos = infosStock(produit.id);
                return (
                  <li key={produit.id} className="flex flex-col gap-3 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <Link to={`/produits/${produit.id}`} className="flex min-w-0 items-center gap-3">
                        <Vignette nom={produit.nom} photoUrl={produit.photoUrl} taille={38} />
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-corps font-medium text-ink-900">{produit.nom}</span>
                          <span className="block font-mono text-meta text-steel-500">{produit.reference ?? '—'}</span>
                        </span>
                      </Link>
                      <EtatProduit produit={produit} quantite={infos.quantite} />
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 gap-y-2">
                      <NiveauStock quantite={infos.quantite} seuil={produit.seuilAlerte} unite={produit.uniteMesure} />
                      <p className="text-right whitespace-nowrap">
                        {produit.prixVente !== null ? (
                          <>
                            <span className="font-medium text-ink-900">{FORMATEUR_GNF.format(produit.prixVente)}</span>{' '}
                            <span className="text-meta text-steel-400">GNF</span>
                          </>
                        ) : (
                          <span className="text-meta text-steel-400">Sans prix</span>
                        )}
                      </p>
                      <p className="min-w-0 text-meta text-steel-500">
                        <Emplacements noms={infos.emplacements} />
                      </p>
                      <div className="flex gap-0.5">
                        <Button
                          variant="ghost"
                          icone
                          aria-label={`Modifier ${produit.nom}`}
                          onClick={() => navigate(`/produits/${produit.id}`)}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </Button>
                        {!produit.archive && (
                          <Button
                            variant="ghost"
                            icone
                            aria-label={`Archiver ${produit.nom}`}
                            onClick={() => setAArchiver(produit)}
                          >
                            <Archive className="size-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
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
        <p className="text-corps text-steel-500">
          Vous pourrez le retrouver en cochant « Afficher les produits archivés ».
        </p>
      </Modal>
    </div>
  );
}
