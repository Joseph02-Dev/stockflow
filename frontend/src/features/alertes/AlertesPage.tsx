import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, PackagePlus, Phone, ShoppingCart } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre, pluriel } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { NiveauStock } from '@/components/patterns/NiveauStock';
import { Vignette } from '@/components/patterns/Vignette';
import { libelleStatut, statutStock, varianteStatut } from '@/components/patterns/statutStock';

interface Alerte {
  id: string;
  type: 'STOCK_FAIBLE' | 'RUPTURE';
  statut: 'ACTIVE' | 'RESOLUE';
  quantiteAuDeclenchement: number;
  createdAt: string;
  resolvedAt: string | null;
  produit: {
    id: string;
    nom: string;
    reference: string | null;
    photoUrl: string | null;
    seuilAlerte: number;
    uniteMesure: string | null;
    fournisseursAssocies: { fournisseur: { id: string; nom: string } }[];
  };
}

interface LigneStock {
  produitId: string;
  quantite: number;
}

interface Fournisseur {
  id: string;
  nom: string;
  photoUrl: string | null;
  telephone: string | null;
  delaiLivraisonJours: number | null;
}

interface LigneManque {
  alerte: Alerte;
  quantite: number;
  /** Seuil − stock actuel, jamais négative : ce qu'il faut pour revenir au seuil. */
  suggestion: number;
}

interface Groupe {
  cle: string;
  fournisseur: Fournisseur | null;
  lignes: LigneManque[];
  ruptures: number;
}

const filtres = [
  { cle: 'ACTIVE', libelle: 'À traiter' },
  { cle: 'RESOLUE', libelle: 'Résolues' },
] as const;

type Statut = (typeof filtres)[number]['cle'];

export function AlertesPage() {
  const navigate = useNavigate();
  const [statut, setStatut] = useState<Statut>('ACTIVE');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['alertes', statut],
    queryFn: async () => (await api.get<Alerte[]>(`/alertes?statut=${statut}`)).data,
  });
  // Stock actuel (l'alerte ne garde que la quantité au déclenchement) et
  // fiche fournisseur (délai, téléphone) — clés de cache partagées avec
  // les écrans Stock et Fournisseurs.
  const stock = useQuery({
    queryKey: ['stock', ''],
    queryFn: async () => (await api.get<LigneStock[]>('/stock?')).data,
    enabled: statut === 'ACTIVE',
  });
  const fournisseurs = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: async () => (await api.get<Fournisseur[]>('/fournisseurs')).data,
    enabled: statut === 'ACTIVE',
  });

  // Regroupe les alertes actives par fournisseur habituel (première
  // association du produit, même logique que la fiche produit) — permet
  // de commander tout ce qui manque chez un fournisseur en une fois.
  const stockActuel = stock.data;
  const fichesFournisseurs = fournisseurs.data;
  const groupes = useMemo<Groupe[]>(() => {
    if (statut !== 'ACTIVE' || !data) return [];
    const quantites = new Map<string, number>();
    for (const ligne of stockActuel ?? []) {
      quantites.set(ligne.produitId, (quantites.get(ligne.produitId) ?? 0) + ligne.quantite);
    }
    const fiches = new Map((fichesFournisseurs ?? []).map((f) => [f.id, f]));

    const parCle = new Map<string, Groupe>();
    for (const alerte of data) {
      const associe = alerte.produit.fournisseursAssocies[0]?.fournisseur;
      const cle = associe?.id ?? 'sans-fournisseur';
      const groupe = parCle.get(cle) ?? {
        cle,
        fournisseur: associe
          ? (fiches.get(associe.id) ?? { ...associe, photoUrl: null, telephone: null, delaiLivraisonJours: null })
          : null,
        lignes: [],
        ruptures: 0,
      };
      const quantite = stockActuel ? (quantites.get(alerte.produit.id) ?? 0) : alerte.quantiteAuDeclenchement;
      groupe.lignes.push({ alerte, quantite, suggestion: Math.max(alerte.produit.seuilAlerte - quantite, 0) });
      if (quantite <= 0) groupe.ruptures += 1;
      parCle.set(cle, groupe);
    }

    for (const groupe of parCle.values()) {
      groupe.lignes.sort((a, b) => a.quantite / Math.max(a.alerte.produit.seuilAlerte, 1) - b.quantite / Math.max(b.alerte.produit.seuilAlerte, 1));
    }
    // Les fournisseurs qui ont des ruptures d'abord ; « sans fournisseur » en dernier.
    return [...parCle.values()].sort((a, b) => {
      if (!a.fournisseur) return 1;
      if (!b.fournisseur) return -1;
      return b.ruptures - a.ruptures || b.lignes.length - a.lignes.length;
    });
  }, [statut, data, stockActuel, fichesFournisseurs]);

  function commander(groupe: Groupe) {
    navigate('/commandes/nouvelle', {
      state: {
        fournisseurId: groupe.fournisseur?.id,
        lignes: groupe.lignes.map((l) => ({
          produitId: l.alerte.produit.id,
          // Une commande porte au moins une unité par ligne.
          quantiteCommandee: Math.max(l.suggestion, 1),
        })),
      },
    });
  }

  const totalRuptures = groupes.reduce((n, g) => n + g.ruptures, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Ce qui manque"
        description="Regroupé par fournisseur pour commander en une seule fois"
        action={
          statut === 'ACTIVE' &&
          data &&
          data.length > 0 && (
            <Link to="/stock" className={boutonClasses('secondary')}>
              <PackagePlus className="size-4" aria-hidden="true" />
              Enregistrer une réception
            </Link>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-rule bg-surface p-0.5" role="tablist" aria-label="Statut des alertes">
          {filtres.map((filtre) => (
            <button
              key={filtre.cle}
              type="button"
              role="tab"
              aria-selected={statut === filtre.cle}
              onClick={() => setStatut(filtre.cle)}
              className={cn(
                'h-8 rounded-sm px-3 text-corps font-medium transition-colors',
                statut === filtre.cle ? 'bg-ink-800 text-white' : 'text-steel-500 hover:text-ink-900',
              )}
            >
              {filtre.libelle}
            </button>
          ))}
        </div>
        {statut === 'ACTIVE' && data && data.length > 0 && (
          <p className="text-corps text-steel-500">
            <span className="font-semibold text-ink-900">{data.length}</span> {pluriel('référence', data.length)} chez{' '}
            <span className="font-semibold text-ink-900">{groupes.length}</span>{' '}
            {pluriel('fournisseur', groupes.length)}, dont{' '}
            <span className="font-semibold text-rupture">{totalRuptures}</span> en rupture
          </p>
        )}
      </div>

      <div role="tabpanel">
        {isLoading || (statut === 'ACTIVE' && stock.isLoading) ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : !data || data.length === 0 ? (
          <Card>
            {statut === 'ACTIVE' ? (
              // État vide volontairement positif : rien ne manque est une
              // bonne nouvelle, pas un manque à combler.
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <CheckCircle2 className="size-8 text-ok" aria-hidden="true" />
                <p className="text-panneau text-ink-900">Rien ne manque</p>
                <p className="max-w-sm text-corps text-steel-500">Tous vos produits sont au-dessus de leur seuil.</p>
              </div>
            ) : (
              <EmptyState
                titre="Aucune alerte résolue"
                description="Les alertes se résolvent automatiquement lorsqu’une entrée de stock fait repasser le produit au-dessus de son seuil."
              />
            )}
          </Card>
        ) : statut === 'ACTIVE' ? (
          <div className="flex flex-col gap-4">
            {groupes.map((groupe) => (
              <PanneauFournisseur key={groupe.cle} groupe={groupe} onCommander={() => commander(groupe)} />
            ))}
          </div>
        ) : (
          <HistoriqueResolues alertes={data} />
        )}
      </div>
    </div>
  );
}

function PanneauFournisseur({ groupe, onCommander }: { groupe: Groupe; onCommander: () => void }) {
  const { fournisseur, lignes, ruptures } = groupe;
  const sousSeuil = lignes.length - ruptures;
  const titreId = `groupe-${groupe.cle}`;

  return (
    <section aria-labelledby={titreId}>
      <Card>
        <header className="flex flex-col gap-3 border-b border-rule bg-entete-groupe px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Vignette nom={fournisseur?.nom ?? '?'} photoUrl={fournisseur?.photoUrl} taille={38} />
            <div className="min-w-0">
              <h2 id={titreId} className="truncate text-panneau text-ink-900">
                {fournisseur ? (
                  <Link to={`/fournisseurs/${fournisseur.id}`} className="hover:underline">
                    {fournisseur.nom}
                  </Link>
                ) : (
                  'Sans fournisseur habituel'
                )}
              </h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta text-steel-500">
                {fournisseur ? (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3 text-steel-400" aria-hidden="true" />
                      {fournisseur.delaiLivraisonJours != null
                        ? `Délai moyen ${fournisseur.delaiLivraisonJours} ${pluriel('jour', fournisseur.delaiLivraisonJours)}`
                        : 'Délai non renseigné'}
                    </span>
                    {fournisseur.telephone && (
                      <a
                        href={`tel:${fournisseur.telephone.replace(/\s/g, '')}`}
                        className="inline-flex items-center gap-1 hover:text-ink-900"
                      >
                        <Phone className="size-3 text-steel-400" aria-hidden="true" />
                        {fournisseur.telephone}
                      </a>
                    )}
                  </>
                ) : (
                  'Associez ces produits à un fournisseur pour les commander en groupe'
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {ruptures > 0 && (
              <Badge variant="rupture">
                {ruptures} {pluriel('rupture', ruptures)}
              </Badge>
            )}
            {sousSeuil > 0 && <Badge variant="faible">{sousSeuil} sous le seuil</Badge>}
            <Button
              variant={fournisseur ? 'primary' : 'secondary'}
              onClick={onCommander}
              className="ml-auto sm:ml-2"
            >
              <ShoppingCart className="size-4" aria-hidden="true" />
              {!fournisseur ? 'Préparer une commande' : lignes.length > 1 ? `Commander les ${lignes.length}` : 'Commander'}
            </Button>
          </div>
        </header>

        {/* En-têtes de colonnes visibles seulement quand les colonnes existent. */}
        <div
          className="hidden grid-cols-[minmax(0,1fr)_150px_108px_120px] gap-4 border-b border-rule px-5 py-2 text-meta font-medium text-steel-500 md:grid"
          aria-hidden="true"
        >
          <span>Produit</span>
          <span>Niveau</span>
          <span>État</span>
          <span className="text-right">À commander</span>
        </div>

        <ul className="divide-y divide-rule">
          {lignes.map(({ alerte, quantite, suggestion }) => {
            const { produit } = alerte;
            const s = statutStock(quantite, produit.seuilAlerte);
            return (
              <li
                key={alerte.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 px-4 py-3 sm:px-5 md:grid-cols-[minmax(0,1fr)_150px_108px_120px]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Vignette nom={produit.nom} photoUrl={produit.photoUrl} taille={32} />
                  <div className="min-w-0">
                    <Link
                      to={`/produits/${produit.id}`}
                      className="line-clamp-2 text-corps font-medium text-ink-900 hover:underline"
                    >
                      {produit.nom}
                    </Link>
                    {produit.reference && (
                      <p className="font-mono text-meta text-steel-500">{produit.reference}</p>
                    )}
                  </div>
                </div>
                <div className="col-start-1 row-start-2 md:col-start-auto md:row-start-auto">
                  <NiveauStock quantite={quantite} seuil={produit.seuilAlerte} unite={produit.uniteMesure} />
                </div>
                <div className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto md:justify-self-start">
                  <Badge variant={varianteStatut[s]}>{libelleStatut[s]}</Badge>
                </div>
                <p className="col-start-2 row-start-2 text-right whitespace-nowrap md:col-start-auto md:row-start-auto">
                  <span className="text-[15px] font-semibold text-ink-900">+{formatNombre(suggestion)}</span>{' '}
                  <span className="text-meta text-steel-400">{produit.uniteMesure ?? pluriel('unité', suggestion)}</span>
                  <span className="sr-only"> à commander</span>
                </p>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

function HistoriqueResolues({ alertes }: { alertes: Alerte[] }) {
  return (
    <Card>
      <ul className="divide-y divide-rule">
        {alertes.map((alerte) => (
          <li key={alerte.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Vignette nom={alerte.produit.nom} photoUrl={alerte.produit.photoUrl} taille={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-corps font-medium text-ink-900">{alerte.produit.nom}</p>
              <p className="text-meta text-steel-500">
                Résolue le {new Date(alerte.resolvedAt ?? alerte.createdAt).toLocaleDateString('fr-FR')}, était à{' '}
                {alerte.quantiteAuDeclenchement} pour un seuil de {alerte.produit.seuilAlerte}
              </p>
            </div>
            <Badge variant={alerte.type === 'RUPTURE' ? 'rupture' : 'faible'}>
              {alerte.type === 'RUPTURE' ? 'Rupture' : 'Sous le seuil'}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
