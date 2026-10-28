import { useMemo, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, CheckCircle2, Clock, PackageX, Phone, ShoppingCart, Truck, type LucideIcon } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre, pluriel } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { Card, PageHeader } from '@/components/patterns/Page';
import { Onglets } from '@/components/patterns/Onglets';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { NiveauStock } from '@/components/patterns/NiveauStock';
import { Vignette } from '@/components/patterns/Vignette';
import { libelleStatut, statutStock, varianteStatut, type StatutStock } from '@/components/patterns/statutStock';
import './alertes.css';

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

const JOUR_MS = 86_400_000;

/** Jours pleins écoulés entre deux dates (0 = le jour même). */
const joursEntre = (debut: string, fin: number) => Math.max(0, Math.floor((fin - new Date(debut).getTime()) / JOUR_MS));

function depuis(jours: number): string {
  if (jours === 0) return 'depuis aujourd’hui';
  if (jours === 1) return 'depuis hier';
  return `depuis ${jours} jours`;
}

function CompteurAlerte({
  Icone,
  valeur,
  libelle,
  teinte,
  pouls,
  actif,
  onClick,
}: {
  Icone: LucideIcon;
  valeur: number;
  libelle: string;
  teinte: string;
  pouls?: boolean;
  actif?: boolean;
  onClick?: () => void;
}) {
  const contenu = (
    <>
      <span className="alertes-anneau" data-pouls={pouls ? '' : undefined} aria-hidden="true">
        <Icone className="size-5" />
      </span>
      <span>
        <span className="block font-display text-[1.625rem] leading-none font-semibold tracking-[-0.02em] text-ink-900">
          {formatNombre(valeur)}
        </span>
        <span className="mt-1 block text-corps text-steel-500">{libelle}</span>
      </span>
    </>
  );
  const style = { '--teinte': teinte } as CSSProperties;
  if (!onClick) {
    return (
      <div className="alertes-compteur max-sm:col-span-2" style={style}>
        {contenu}
      </div>
    );
  }
  return (
    <button type="button" className="alertes-compteur" aria-pressed={actif} onClick={onClick} style={style}>
      {contenu}
    </button>
  );
}

export function AlertesPage() {
  const navigate = useNavigate();
  const [statut, setStatut] = useState<Statut>('ACTIVE');
  const [filtre, setFiltre] = useState<Exclude<StatutStock, 'ok'> | null>(null);
  const [maintenant] = useState(() => Date.now());

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
  const totalLignes = groupes.reduce((n, g) => n + g.lignes.length, 0);
  // Filtre des compteurs : ne garde que les lignes de cet état, et les groupes qui en ont.
  const groupesVisibles = filtre
    ? groupes
        .map((g) => ({
          ...g,
          lignes: g.lignes.filter((l) => statutStock(l.quantite, l.alerte.produit.seuilAlerte) === filtre),
        }))
        .filter((g) => g.lignes.length > 0)
        .map((g) => ({ ...g, ruptures: g.lignes.filter((l) => l.quantite <= 0).length }))
    : groupes;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Ce qui manque"
        description="Regroupé par fournisseur pour commander en une seule fois"
        action={
          statut === 'ACTIVE' &&
          data &&
          data.length > 0 && (
            <Link to="/stock" state={{ nouveauMouvement: true }} className={boutonClasses('secondary')}>
              <ArrowDown className="size-4" aria-hidden="true" />
              Enregistrer une réception
            </Link>
          )
        }
      />

      {statut === 'ACTIVE' && groupes.length > 0 && (
        <section aria-label="Résumé" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <CompteurAlerte
            Icone={PackageX}
            valeur={totalRuptures}
            libelle="En rupture"
            teinte="var(--color-rupture)"
            pouls={totalRuptures > 0}
            actif={filtre === 'rupture'}
            onClick={() => setFiltre((f) => (f === 'rupture' ? null : 'rupture'))}
          />
          <CompteurAlerte
            Icone={ArrowDown}
            valeur={totalLignes - totalRuptures}
            libelle="Sous le seuil"
            teinte="var(--color-faible)"
            actif={filtre === 'faible'}
            onClick={() => setFiltre((f) => (f === 'faible' ? null : 'faible'))}
          />
          <CompteurAlerte
            Icone={Truck}
            valeur={groupes.filter((g) => g.fournisseur).length}
            libelle={pluriel('Fournisseur à contacter', groupes.filter((g) => g.fournisseur).length, 'Fournisseurs à contacter')}
            teinte="var(--color-action)"
          />
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Onglets onglets={filtres} actif={statut} onChange={setStatut} libelle="Statut des alertes" />
        {statut === 'ACTIVE' && data && data.length > 0 && (
          <p className="text-corps text-steel-500">
            {filtre ? (
              <>
                Filtre « {filtre === 'rupture' ? 'En rupture' : 'Sous le seuil'} » ·{' '}
                <button type="button" onClick={() => setFiltre(null)} className={boutonClasses('ghost', undefined, { taille: 'sm' })}>
                  Tout afficher
                </button>
              </>
            ) : (
              <>
                <span className="font-semibold text-ink-900">{data.length}</span> {pluriel('référence', data.length)}{' '}
                chez <span className="font-semibold text-ink-900">{groupes.length}</span>{' '}
                {pluriel('fournisseur', groupes.length)}
              </>
            )}
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
            {groupesVisibles.length === 0 && (
              <Card>
                <EmptyState
                  titre={filtre === 'rupture' ? 'Aucune rupture' : 'Aucun produit sous le seuil'}
                  description="Les autres alertes restent visibles sans filtre."
                  action={
                    <Button variant="secondary" onClick={() => setFiltre(null)}>
                      Tout afficher
                    </Button>
                  }
                />
              </Card>
            )}
            {groupesVisibles.map((groupe) => (
              <PanneauFournisseur
                key={groupe.cle}
                groupe={groupe}
                maintenant={maintenant}
                onCommander={() => commander(groupe)}
              />
            ))}
          </div>
        ) : (
          <HistoriqueResolues alertes={data} maintenant={maintenant} />
        )}
      </div>
    </div>
  );
}

function PanneauFournisseur({
  groupe,
  maintenant,
  onCommander,
}: {
  groupe: Groupe;
  maintenant: number;
  onCommander: () => void;
}) {
  const { fournisseur, lignes, ruptures } = groupe;
  const sousSeuil = lignes.length - ruptures;
  const titreId = `groupe-${groupe.cle}`;

  return (
    <section aria-labelledby={titreId}>
      <Card>
        <header className="alertes-entete flex flex-col gap-3 border-b border-rule px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Vignette nom={fournisseur?.nom ?? '?'} photoUrl={fournisseur?.photoUrl} taille={44} />
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
          className="alertes-ligne alertes-colonnes border-b border-rule py-2 text-meta font-medium text-steel-500"
          aria-hidden="true"
        >
          <span>Produit</span>
          <span>Niveau</span>
          <span>État</span>
          <span className="text-right">À commander</span>
        </div>

        <ul className="divide-y divide-rule">
          {lignes.map(({ alerte, quantite, suggestion }, rang) => {
            const { produit } = alerte;
            const s = statutStock(quantite, produit.seuilAlerte);
            const jours = joursEntre(alerte.createdAt, maintenant);
            const unite = produit.uniteMesure ?? pluriel('unité', suggestion);
            return (
              <li
                key={alerte.id}
                className="alertes-ligne alertes-apparition"
                style={{ animationDelay: `${Math.min(rang, 12) * 40}ms` }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Vignette nom={produit.nom} photoUrl={produit.photoUrl} taille={40} />
                  <div className="min-w-0">
                    <Link
                      to={`/produits/${produit.id}`}
                      className="line-clamp-2 text-corps font-semibold text-ink-900 hover:underline"
                    >
                      {produit.nom}
                    </Link>
                    <p className="flex min-w-0 gap-2 overflow-hidden text-meta whitespace-nowrap text-steel-400">
                      {produit.reference && <span className="font-mono">{produit.reference}</span>}
                      <span className={cn('font-semibold', s === 'rupture' ? 'text-rupture' : 'text-faible')}>
                        {depuis(jours)}
                      </span>
                    </p>
                  </div>
                </div>
                <NiveauStock quantite={quantite} seuil={produit.seuilAlerte} unite={produit.uniteMesure} />
                <span>
                  <Badge variant={varianteStatut[s]}>{libelleStatut[s]}</Badge>
                </span>
                <p className="text-right whitespace-nowrap">
                  <span className="font-display text-[17px] font-semibold text-ink-900">+{formatNombre(suggestion)}</span>
                  <span className="block text-meta text-steel-400">
                    {unite}
                    <span className="max-sm:hidden"> à commander</span>
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

const dateHeure = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

function HistoriqueResolues({ alertes, maintenant }: { alertes: Alerte[]; maintenant: number }) {
  return (
    <Card>
      <ul className="divide-y divide-rule">
        {alertes.map((alerte) => {
          const resolue = alerte.resolvedAt ?? alerte.createdAt;
          const duree = joursEntre(alerte.createdAt, new Date(resolue).getTime());
          return (
            <li key={alerte.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Vignette nom={alerte.produit.nom} photoUrl={alerte.produit.photoUrl} taille={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-corps font-semibold text-ink-900">{alerte.produit.nom}</p>
                <p className="text-meta text-steel-500">
                  {alerte.type === 'RUPTURE' ? 'Rupture' : 'Sous le seuil'} · était à {alerte.quantiteAuDeclenchement}{' '}
                  pour un seuil de {alerte.produit.seuilAlerte}
                </p>
              </div>
              <p className="shrink-0 text-right text-meta whitespace-nowrap text-steel-500">
                <span className="block font-semibold text-ok">Résolue</span>
                {new Date(resolue).toDateString() === new Date(maintenant).toDateString()
                  ? `Aujourd’hui, ${heure.format(new Date(resolue))}`
                  : dateHeure.format(new Date(resolue))}
                <span className="max-sm:hidden"> · en {duree === 0 ? 'moins d’un jour' : `${duree} ${pluriel('jour', duree)}`}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
