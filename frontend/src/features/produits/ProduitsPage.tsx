import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Pagination } from '@/components/patterns/Pagination';
import { usePagination } from '@/components/patterns/usePagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Archive,
  Download,
  LayoutGrid,
  Layers,
  List,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Upload,
  type LucideIcon,
} from 'lucide-react';
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
import { libelleStatut, statutStock, varianteStatut, type StatutStock } from '@/components/patterns/statutStock';
import { Compteur } from '@/components/patterns/Compteur';
import { useDebounce } from '@/lib/useDebounce';
import { useModules } from '@/lib/useModules';
import './produits.css';
import { useStockAvecAttente } from '@/features/stock/stockEnAttente';
import { boutonClasses } from '@/components/ui/boutonClasses';

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
  /** Variante d'un modèle (module « variantes »). */
  modele?: { id: string; nom: string } | null;
}

interface LigneStock {
  produitId: string;
  emplacementId: string;
  quantite: number;
  produit: { nom: string };
  emplacement: { nom: string };
}

const FORMATEUR_GNF = new Intl.NumberFormat('fr-FR');
const TOUTES = '__toutes__';
const SANS_CATEGORIE = '__sans__';
const CLE_VUE = 'stockflow.produits.vue';

type Vue = 'liste' | 'grille';

function lireVue(): Vue {
  try {
    return localStorage.getItem(CLE_VUE) === 'grille' ? 'grille' : 'liste';
  } catch {
    return 'liste';
  }
}

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .map((mot) => mot[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Teinte stable par catégorie, pour les vignettes sans photo. */
const TEINTES = ['#c2440b', '#12705c', '#2f6fb3', '#9a6500', '#7a4bc2', '#c32b1e'];
function teinteDe(cle: string): string {
  let somme = 0;
  for (const caractere of cle) somme += caractere.charCodeAt(0);
  return TEINTES[somme % TEINTES.length];
}

const INDICATEURS: { statut: StatutStock; titre: string; detail: string; teinte: string }[] = [
  { statut: 'ok', titre: 'En stock', detail: 'au-dessus du seuil', teinte: 'var(--color-ok)' },
  { statut: 'faible', titre: 'Sous le seuil', detail: 'à réapprovisionner', teinte: 'var(--color-faible)' },
  { statut: 'rupture', titre: 'En rupture', detail: 'plus aucune unité', teinte: 'var(--color-rupture)' },
];

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

function Prix({ valeur }: { valeur: number | null }) {
  if (valeur === null) return <span className="text-meta text-steel-400">Sans prix</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono font-semibold text-ink-900">{FORMATEUR_GNF.format(valeur)}</span>{' '}
      <span className="text-meta text-steel-400">GNF</span>
    </span>
  );
}

interface ActionPlus {
  libelle: string;
  Icone: LucideIcon;
  onSelect: () => void;
  desactive?: boolean;
}

/** Actions secondaires de l'en-tête (import, export, modèles), regroupées dans un menu. */
function MenuPlus({ actions }: { actions: ActionPlus[] }) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent) => {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    document.addEventListener('mousedown', surClic);
    document.addEventListener('keydown', surTouche);
    return () => {
      document.removeEventListener('mousedown', surClic);
      document.removeEventListener('keydown', surTouche);
    };
  }, [ouvert]);

  return (
    <div ref={racine} className="relative">
      <Button variant="secondary" aria-haspopup="menu" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        <MoreHorizontal className="size-4" aria-hidden="true" />
        <span className="max-sm:sr-only">Plus</span>
      </Button>
      {ouvert && (
        <div role="menu" className="fenetre-entree absolute top-full right-0 z-20 mt-1.5 min-w-[220px] rounded-lg border border-rule bg-surface p-1.5 shadow-pop">
          {actions.map(({ libelle, Icone, onSelect, desactive }) => (
            <button
              key={libelle}
              type="button"
              role="menuitem"
              disabled={desactive}
              onClick={() => {
                setOuvert(false);
                onSelect();
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-corps text-ink-900 hover:bg-survol disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icone className="size-4 shrink-0 text-steel-500" aria-hidden="true" />
              {libelle}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProduitsPage() {
  const navigate = useNavigate();
  const modules = useModules();
  const queryClient = useQueryClient();
  // ?q= : recherche lancée depuis la barre supérieure.
  const [parametresUrl] = useSearchParams();
  const rechercheUrl = parametresUrl.get('q') ?? '';
  const [recherche, setRecherche] = useState(rechercheUrl);
  const [rechercheUrlVue, setRechercheUrlVue] = useState(rechercheUrl);
  if (rechercheUrl !== rechercheUrlVue) {
    setRechercheUrlVue(rechercheUrl);
    setRecherche(rechercheUrl);
  }
  const [afficherArchives, setAfficherArchives] = useState(false);
  const [aArchiver, setAArchiver] = useState<Produit | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // ?categorie= : filtre ouvert depuis Catégories & marques (« sans » : produits sans catégorie).
  const [categorieFiltre, setCategorieFiltre] = useState(() => {
    const categorieUrl = parametresUrl.get('categorie');
    return categorieUrl === 'sans' ? SANS_CATEGORIE : (categorieUrl ?? TOUTES);
  });
  const [statutFiltre, setStatutFiltre] = useState<StatutStock | null>(null);
  const [vue, setVue] = useState<Vue>(lireVue);
  const champRecherche = useRef<HTMLInputElement>(null);

  function choisirVue(valeur: Vue) {
    setVue(valeur);
    try {
      localStorage.setItem(CLE_VUE, valeur);
    } catch {
      // Préférence non mémorisée (navigation privée) : la vue reste valable pour la session.
    }
  }

  // « / » place le curseur dans la recherche, sauf pendant une saisie.
  useEffect(() => {
    function surTouche(e: KeyboardEvent) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const cible = e.target as HTMLElement;
      if (cible.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      champRecherche.current?.focus();
    }
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, []);

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
  // Opérations saisies hors ligne, pas encore envoyées : déjà comptées.
  const lignesStock = useStockAvecAttente(stock.data);
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

  const infosStock = (id: string) => parProduit.get(id) ?? { quantite: 0, emplacements: [] };

  // Indicateurs du haut : produits actifs du catalogue affiché (recherche comprise).
  const resume = useMemo(() => {
    const total: Record<StatutStock, number> = { ok: 0, faible: 0, rupture: 0 };
    let valeur = 0;
    let actifs = 0;
    for (const produit of data ?? []) {
      if (produit.archive) continue;
      actifs += 1;
      const quantite = parProduit.get(produit.id)?.quantite ?? 0;
      total[statutStock(quantite, produit.seuilAlerte)] += 1;
      if (produit.prixVente !== null && quantite > 0) valeur += produit.prixVente * quantite;
    }
    return { total, valeur, actifs };
  }, [data, parProduit]);

  const produitsAffiches = (data ?? []).filter(
    (p) =>
      (categorieFiltre === TOUTES || (p.categorie?.id ?? SANS_CATEGORIE) === categorieFiltre) &&
      (statutFiltre === null ||
        (!p.archive && statutStock(infosStock(p.id).quantite, p.seuilAlerte) === statutFiltre)),
  );
  const { visibles: produitsPage, ancre, pagination } = usePagination(produitsAffiches, {
    reinitialiser: [rechercheRetardee, afficherArchives, categorieFiltre, statutFiltre],
  });
  const filtresActifs = recherche !== '' || categorieFiltre !== TOUTES || statutFiltre !== null;

  function effacerFiltres() {
    setRecherche('');
    setCategorieFiltre(TOUTES);
    setStatutFiltre(null);
  }

  const archiver = useMutation({
    mutationFn: async (id: string) => api.patch(`/produits/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produits'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setAArchiver(null);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’archivage a échoué.')),
  });


  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Produits"
        description="Votre catalogue, où il se trouve et ce qu’il en reste."
        action={
          <>
            <MenuPlus
              actions={[
                ...(modules.import
                  ? [{ libelle: 'Importer un fichier', Icone: Upload, onSelect: () => navigate('/produits/import') }]
                  : []),
                {
                  libelle: 'Exporter en CSV',
                  Icone: Download,
                  desactive: !data || data.length === 0,
                  onSelect: () =>
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
                    ),
                },
                ...(modules.variantes
                  ? [{ libelle: 'Modèles à variantes', Icone: Layers, onSelect: () => navigate('/produits/modeles') }]
                  : []),
              ]}
            />
            <Button onClick={() => navigate('/produits/nouveau')}>
              <Plus className="size-4" aria-hidden="true" />
              Nouveau produit
            </Button>
          </>
        }
      />

      {data && resume.actifs > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {INDICATEURS.map(({ statut, titre, detail, teinte }) => (
            <button
              key={statut}
              type="button"
              aria-pressed={statutFiltre === statut}
              onClick={() => setStatutFiltre((s) => (s === statut ? null : statut))}
              className="produits-indicateur"
              style={{ '--teinte': teinte } as CSSProperties}
            >
              <span className="flex items-center gap-2 text-meta font-semibold text-steel-500">
                <i className="size-2 rounded-full" style={{ background: teinte }} aria-hidden="true" />
                {titre}
              </span>
              <span className="font-display text-[1.625rem] leading-none font-semibold tracking-[-0.02em] text-ink-900">
                <Compteur valeur={resume.total[statut]} format={(n) => FORMATEUR_GNF.format(n)} />
              </span>
              <span className="text-meta text-steel-400">{detail}</span>
            </button>
          ))}
          <div className="produits-indicateur produits-indicateur-fixe" style={{ '--teinte': 'var(--color-action)' } as CSSProperties}>
            <span className="flex items-center gap-2 text-meta font-semibold text-steel-500">
              <i className="size-2 rounded-full bg-action" aria-hidden="true" />
              Valeur au prix de vente
            </span>
            <span className="font-display text-[1.375rem] leading-none font-semibold tracking-[-0.02em] whitespace-nowrap text-ink-900">
              <Compteur valeur={resume.valeur} format={(n) => FORMATEUR_GNF.format(n)} />{' '}
              <span className="text-meta font-medium text-steel-400">GNF</span>
            </span>
            <span className="text-meta text-steel-400">
              {resume.actifs} produit{resume.actifs > 1 ? 's' : ''} actif{resume.actifs > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          <div className="relative min-w-0 flex-1 basis-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel-400"
              aria-hidden="true"
            />
            <input
              ref={champRecherche}
              type="search"
              value={recherche}
              onChange={(event) => setRecherche(event.target.value)}
              placeholder="Rechercher par nom ou référence…"
              aria-label="Rechercher un produit"
              aria-keyshortcuts="/"
              className="champ h-10 w-full rounded-lg border border-rule-strong bg-surface-elevee pr-10 pl-9 text-corps text-ink-900 placeholder:text-steel-400 hover:border-steel-400 focus:border-action"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-rule-strong px-1.5 font-mono text-[11px] text-steel-400 max-sm:hidden">
              /
            </kbd>
          </div>

          <div className="produits-vue" role="group" aria-label="Affichage">
            <button type="button" aria-pressed={vue === 'liste'} onClick={() => choisirVue('liste')} aria-label="Liste" title="Liste">
              <List className="size-4" aria-hidden="true" />
            </button>
            <button type="button" aria-pressed={vue === 'grille'} onClick={() => choisirVue('grille')} aria-label="Grille" title="Grille">
              <LayoutGrid className="size-4" aria-hidden="true" />
            </button>
          </div>

          <label className="produits-bascule">
            <input
              type="checkbox"
              checked={afficherArchives}
              onChange={(event) => setAfficherArchives(event.target.checked)}
            />
            <span aria-hidden="true" />
            Archivés
          </label>
        </div>

        {categories.length > 1 && (
          // Sur mobile, une seule rangée qui défile plutôt que trois lignes de pastilles.
          <div
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
            role="group"
            aria-label="Filtrer par catégorie"
          >
            {[[TOUTES, { nom: 'Toutes', n: data?.length ?? 0 }] as const, ...categories].map(([cle, { nom, n }]) => (
              <button
                key={cle}
                type="button"
                aria-pressed={categorieFiltre === cle}
                onClick={() => setCategorieFiltre(cle)}
                className="produits-categorie"
              >
                {nom}
                <span className="font-mono text-[11.5px] opacity-60">{n}</span>
              </button>
            ))}
          </div>
        )}

        {data && (
          <div className="flex items-center justify-between px-0.5 text-meta text-steel-500">
            <span>
              {produitsAffiches.length} produit{produitsAffiches.length > 1 ? 's' : ''}
            </span>
            {filtresActifs && (
              <button type="button" onClick={effacerFiltres} className={boutonClasses('ghost', undefined, { taille: 'sm' })}>
                Effacer les filtres
              </button>
            )}
          </div>
        )}
      </div>

      {erreur && <Alert variant="error">{erreur}</Alert>}

      <Card>
        <div ref={ancre} className="scroll-mt-20" />
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : produitsAffiches.length > 0 && vue === 'grille' ? (
          <>
            <ul className="produits-grille">
              {produitsPage.map((produit) => {
                const infos = infosStock(produit.id);
                const teinte = teinteDe(produit.categorie?.id ?? SANS_CATEGORIE);
                return (
                  <li key={produit.id} className="produits-carte">
                    <Link to={`/produits/${produit.id}`} className="flex flex-col gap-3 rounded-md">
                      <span className="produits-visuel" style={{ '--teinte': teinte } as CSSProperties}>
                        {produit.photoUrl ? (
                          <img src={produit.photoUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <span aria-hidden="true">{initiales(produit.nom)}</span>
                        )}
                        <span className="absolute top-2 left-2">
                          <EtatProduit produit={produit} quantite={infos.quantite} />
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 font-semibold text-ink-900">{produit.nom}</span>
                        <span className="mt-1 flex items-center justify-between gap-2 text-meta text-steel-500">
                          <span className="truncate">{produit.categorie?.nom ?? 'Sans catégorie'}</span>
                          <Emplacements noms={infos.emplacements} />
                        </span>
                      </span>
                      <NiveauStock quantite={infos.quantite} seuil={produit.seuilAlerte} unite={produit.uniteMesure} />
                    </Link>
                    <div className="flex items-center justify-between border-t border-rule pt-2.5">
                      <Prix valeur={produit.prixVente} />
                      <div className="flex gap-0.5">
                        <Button
                          variant="ghost"
                          taille="sm"
                          icone
                          aria-label={`Modifier ${produit.nom}`}
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
            <Pagination etat={pagination} className="border-t border-rule" />
          </>
        ) : produitsAffiches.length > 0 ? (
          <>
            <div className="relative hidden overflow-x-auto lg:block">
              <table className="w-full text-corps">
                <thead className="border-b border-rule bg-entete-tableau text-left text-meta font-medium text-steel-500">
                  <tr>
                    <th scope="col" className="py-2.5 pr-3 pl-5 font-medium">Produit</th>
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
                  {produitsPage.map((produit) => {
                    const infos = infosStock(produit.id);
                    return (
                      <tr key={produit.id} className="produits-ligne">
                        <td className="py-2.5 pr-3 pl-5">
                          <Link to={`/produits/${produit.id}`} className="group flex min-w-0 items-center gap-3">
                            <Vignette nom={produit.nom} photoUrl={produit.photoUrl} taille={40} teinte={teinteDe(produit.categorie?.id ?? SANS_CATEGORIE)} />
                            <span className="min-w-0">
                              <span className="block max-w-[300px] truncate font-medium text-ink-900 group-hover:underline">
                                {produit.nom}
                              </span>
                              <span className="block font-mono text-meta text-steel-500">
                                {produit.reference ?? '—'}
                                {produit.modele && <span className="ml-2 font-sans text-action">Variante</span>}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-steel-700">
                          {produit.categorie ? (
                            <span className="inline-flex h-6 items-center rounded-full bg-survol px-2.5 text-meta font-semibold text-steel-700">
                              {produit.categorie.nom}
                            </span>
                          ) : (
                            <span className="text-steel-400">—</span>
                          )}
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
                        <td className="px-3 py-2.5 text-right">
                          <Prix valeur={produit.prixVente} />
                        </td>
                        <td className="min-w-[124px] px-3 py-2.5">
                          <EtatProduit produit={produit} quantite={infos.quantite} />
                        </td>
                        <td className="py-2.5 pr-5 pl-3">
                          <div className="produits-gestes flex justify-end gap-0.5">
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
              {produitsPage.map((produit) => {
                const infos = infosStock(produit.id);
                return (
                  <li key={produit.id} className="flex flex-col gap-3 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <Link to={`/produits/${produit.id}`} className="flex min-w-0 items-center gap-3">
                        <Vignette nom={produit.nom} photoUrl={produit.photoUrl} taille={40} teinte={teinteDe(produit.categorie?.id ?? SANS_CATEGORIE)} />
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-corps font-medium text-ink-900">{produit.nom}</span>
                          <span className="block font-mono text-meta text-steel-500">{produit.reference ?? '—'}</span>
                        </span>
                      </Link>
                      <EtatProduit produit={produit} quantite={infos.quantite} />
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 gap-y-2">
                      <NiveauStock quantite={infos.quantite} seuil={produit.seuilAlerte} unite={produit.uniteMesure} />
                      <p className="text-right">
                        <Prix valeur={produit.prixVente} />
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
            <Pagination etat={pagination} className="border-t border-rule" />
          </>
        ) : filtresActifs ? (
          <EmptyState
            titre="Aucun produit ne correspond"
            description="Modifiez la recherche ou effacez les filtres."
            action={
              <Button variant="secondary" onClick={effacerFiltres}>
                Effacer les filtres
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
          Vous pourrez le retrouver en activant « Archivés » au-dessus de la liste.
        </p>
      </Modal>
    </div>
  );
}
