import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  MapPin,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre, pluriel, tempsRelatif } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, PanneauEntete } from '@/components/patterns/Page';
import { ErrorState, LoadingState, Squelette } from '@/components/patterns/States';
import { NiveauStock } from '@/components/patterns/NiveauStock';
import { Vignette } from '@/components/patterns/Vignette';
import { libelleStatut, statutStock, varianteStatut } from '@/components/patterns/statutStock';
import { presentationMouvement, quantiteSignee, type TypeMouvement } from '@/components/patterns/typeMouvement';

interface Overview {
  kpi: {
    produitsActifs: number;
    emplacementsActifs: number;
    alertesActives: number;
    mouvements7Jours: number;
    quantiteTotaleEnStock: number;
  };
}

interface AlerteActive {
  id: string;
  type: 'STOCK_FAIBLE' | 'RUPTURE';
  produit: {
    id: string;
    nom: string;
    photoUrl: string | null;
    seuilAlerte: number;
    uniteMesure: string | null;
    fournisseursAssocies: { fournisseur: { id: string; nom: string } }[];
  };
}

/** Indicateurs calculés par la base (GET /dashboard/indicateurs). */
interface Indicateurs {
  valeurImmobilisee: number;
  lignesSansPrix: number;
  serieValeur: number[];
  mouvementsSemaine: number;
  mouvementsSemainePrecedente: number;
  delaiFournisseurMoyen: number | null;
  nombreDelais: number;
  commandesEnRoute: number;
  stockProduitsEnAlerte: { produitId: string; quantite: number; emplacementBas: string | null }[];
}

interface Mouvement {
  id: string;
  type: TypeMouvement;
  quantite: number;
  createdAt: string;
  produitId: string;
  produit: { nom: string };
  emplacement: { nom: string };
  emplacementDestination: { nom: string } | null;
}

const NB_BARRES = 9;

export function DashboardPage() {
  const navigate = useNavigate();

  const overview = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<Overview>('/dashboard/overview')).data,
  });
  // Les clés de cache sont partagées avec les écrans Alertes, Stock et
  // Commandes : tout mouvement qui les invalide rafraîchit aussi ce
  // tableau de bord, sans route API dédiée.
  const alertes = useQuery({
    queryKey: ['alertes', 'ACTIVE'],
    queryFn: async () => (await api.get<AlerteActive[]>('/alertes?statut=ACTIVE')).data,
  });
  // Les agrégats (valeur, série, semaines, délais, stock des produits en
  // alerte) sont calculés par la base : le navigateur ne télécharge plus
  // ni tout le stock ni tout l'historique des mouvements.
  const indicateurs = useQuery({
    queryKey: ['dashboard', 'indicateurs'],
    queryFn: async () => (await api.get<Indicateurs>('/dashboard/indicateurs')).data,
  });
  const mouvements = useQuery({
    queryKey: ['mouvements', 'recents'],
    queryFn: async () => (await api.get<Mouvement[]>('/mouvements?limite=7')).data,
  });

  // Instant de référence des « il y a … » : dernière récupération, stable
  // d'un rendu à l'autre.
  const maintenant = mouvements.dataUpdatedAt || indicateurs.dataUpdatedAt;

  const calculs = useMemo(() => {
    const ind = indicateurs.data;
    const parProduit = new Map((ind?.stockProduitsEnAlerte ?? []).map((l) => [l.produitId, l]));
    const aReapprovisionner = (alertes.data ?? [])
      .map((alerte) => {
        const infos = parProduit.get(alerte.produit.id);
        return { alerte, quantite: infos?.quantite ?? 0, emplacement: infos?.emplacementBas ?? undefined };
      })
      // Ruptures d'abord, puis les produits les plus loin de leur seuil.
      .sort(
        (a, b) =>
          a.quantite / Math.max(a.alerte.produit.seuilAlerte, 1) - b.quantite / Math.max(b.alerte.produit.seuilAlerte, 1),
      );

    return {
      valeur: ind?.valeurImmobilisee ?? 0,
      sansPrix: ind?.lignesSansPrix ?? 0,
      serie: ind?.serieValeur ?? Array<number>(NB_BARRES).fill(0),
      ecartSemaine: (ind?.mouvementsSemaine ?? 0) - (ind?.mouvementsSemainePrecedente ?? 0),
      delaiMoyen: ind?.delaiFournisseurMoyen ?? null,
      nbDelais: ind?.nombreDelais ?? 0,
      aReapprovisionner,
      ruptures: aReapprovisionner.filter((l) => l.quantite <= 0).length,
      enRoute: ind?.commandesEnRoute ?? 0,
    };
  }, [indicateurs.data, alertes.data]);

  if (overview.isLoading || alertes.isLoading || indicateurs.isLoading) return <SqueletteTableauDeBord />;
  if (overview.isError) {
    return <ErrorState message={messageErreur(overview.error)} onRetry={() => overview.refetch()} />;
  }
  if (!overview.data) return null;

  const { kpi } = overview.data;
  const nbAction = calculs.aReapprovisionner.length;
  const sousSeuil = nbAction - calculs.ruptures;
  const maxSerie = Math.max(...calculs.serie, 1);

  function commander(ligne: (typeof calculs.aReapprovisionner)[number]) {
    const { produit } = ligne.alerte;
    navigate('/commandes/nouvelle', {
      state: {
        fournisseurId: produit.fournisseursAssocies[0]?.fournisseur.id,
        // Ramener le stock au seuil, jamais moins d'une unité commandée.
        lignes: [{ produitId: produit.id, quantiteCommandee: Math.max(produit.seuilAlerte - ligne.quantite, 1) }],
      },
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">Tableau de bord</h1>

      {/* a) Bandeau d'action — répond à « qu'est-ce qui va me manquer aujourd'hui ? » */}
      <section
        className="bandeau-action flex flex-col gap-6 rounded-lg px-5 py-6 text-white sm:px-[26px] sm:py-6 lg:flex-row lg:items-end lg:justify-between"
        aria-labelledby="titre-bandeau"
      >
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <h2 id="titre-bandeau" className="text-[24px] leading-[30px] font-semibold tracking-[-0.01em]">
              {nbAction > 0
                ? `${nbAction} ${pluriel('référence', nbAction)} ${nbAction > 1 ? 'demandent' : 'demande'} une action`
                : 'Aucune référence ne demande d’action'}
            </h2>
            <p className="mt-1.5 text-corps text-white/65">
              Sur {formatNombre(kpi.produitsActifs)} {pluriel('référence', kpi.produitsActifs)}{' '}
              {pluriel('suivie', kpi.produitsActifs)}, {kpi.emplacementsActifs > 1 ? 'réparties' : 'répartie'} dans{' '}
              {kpi.emplacementsActifs} {pluriel('emplacement', kpi.emplacementsActifs)}
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-4 sm:flex sm:gap-8">
            {[
              { libelle: pluriel('Rupture', calculs.ruptures), valeur: calculs.ruptures, filet: 'border-rupture-vif' },
              { libelle: 'Sous le seuil', valeur: sousSeuil, filet: 'border-faible-vif' },
              { libelle: 'Commandes en route', valeur: calculs.enRoute, filet: 'border-white/14' },
            ].map((mesure) => (
              <div key={mesure.libelle} className={cn('flex flex-col-reverse border-l-2 pl-3', mesure.filet)}>
                <dt className="text-meta text-white/65">{mesure.libelle}</dt>
                <dd className="text-chiffre">{mesure.valeur}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Link
          to="/commandes/nouvelle"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-md bg-white px-4 text-corps font-semibold text-voile transition-colors hover:bg-craie focus-visible:outline-white lg:self-end"
        >
          <ShoppingCart className="size-4" aria-hidden="true" />
          Préparer les commandes
        </Link>
      </section>

      {/* b) Bande de mesures — filets de 1px, pas des cartes distinctes. */}
      <section
        aria-label="Mesures"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule shadow-card lg:grid-cols-[1.5fr_1fr_1fr_1fr]"
      >
        <div className="flex items-end justify-between gap-4 bg-surface px-5 py-4 col-span-2 lg:col-span-1">
          <div className="min-w-0">
            <p className="text-meta text-steel-500">Valeur immobilisée</p>
            <p className="mt-1 text-chiffre text-ink-900">
              {formatNombre(calculs.valeur)} <span className="text-corps font-medium text-steel-400">GNF</span>
            </p>
            <p className="mt-1 text-meta text-steel-400">
              {calculs.sansPrix > 0
                ? `Au prix d’achat, ${calculs.sansPrix} ${pluriel('ligne', calculs.sansPrix)} sans prix`
                : 'Au prix d’achat, sur 9 jours'}
            </p>
          </div>
          <div className="flex h-10 shrink-0 items-end gap-[3px]" aria-hidden="true">
            {calculs.serie.map((v, i) => (
              <span
                key={i}
                className={cn('w-[6px] rounded-[2px]', i === NB_BARRES - 1 ? 'bg-action' : 'bg-action/25')}
                style={{ height: `${Math.max(12, (v / maxSerie) * 100)}%` }}
              />
            ))}
          </div>
        </div>

        <div className="bg-surface px-4 py-4 sm:px-5">
          <p className="text-meta text-steel-500">Mouvements 7 jours</p>
          <p className="mt-1 text-chiffre text-ink-900">{formatNombre(kpi.mouvements7Jours)}</p>
          <p
            className={cn(
              'mt-1 flex items-center gap-1 text-meta',
              calculs.ecartSemaine >= 0 ? 'text-ok' : 'text-steel-500',
            )}
          >
            {calculs.ecartSemaine >= 0 ? (
              <TrendingUp className="size-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="size-3.5" aria-hidden="true" />
            )}
            {calculs.ecartSemaine >= 0 ? '+' : '−'}
            {Math.abs(calculs.ecartSemaine)} vs semaine précédente
          </p>
        </div>

        <div className="bg-surface px-4 py-4 sm:px-5">
          <p className="text-meta text-steel-500">Références actives</p>
          <p className="mt-1 text-chiffre text-ink-900">{formatNombre(kpi.produitsActifs)}</p>
          <p className="mt-1 text-meta text-steel-400">
            {formatNombre(kpi.quantiteTotaleEnStock)} {pluriel('unité', kpi.quantiteTotaleEnStock)} en stock
          </p>
        </div>

        <div className="col-span-2 bg-surface px-4 py-4 sm:px-5 lg:col-span-1">
          <p className="text-meta text-steel-500">Délai fournisseur moyen</p>
          <p className="mt-1 text-chiffre text-ink-900">
            {calculs.delaiMoyen == null ? (
              '—'
            ) : (
              <>
                {calculs.delaiMoyen.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}{' '}
                <span className="text-corps font-medium text-steel-400">{pluriel('jour', calculs.delaiMoyen)}</span>
              </>
            )}
          </p>
          <p className="mt-1 text-meta text-steel-400">
            {calculs.nbDelais > 0
              ? `Annoncé par ${calculs.nbDelais} ${pluriel('fournisseur', calculs.nbDelais)}`
              : 'Aucun délai renseigné'}
          </p>
        </div>
      </section>

      {/* c) Deux colonnes : ce qu'il faut commander, ce qui vient de bouger. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <PanneauEntete
            titre="À réapprovisionner"
            meta={
              nbAction > 0
                ? `${nbAction} ${pluriel('référence', nbAction)}, ruptures en premier`
                : 'Tous les produits sont au-dessus de leur seuil'
            }
            action={
              nbAction > 0 && (
                <Link to="/alertes" className="shrink-0 text-corps font-medium text-action hover:underline">
                  Voir par fournisseur
                </Link>
              )
            }
          />
          {nbAction === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <CheckCircle2 className="size-7 text-ok" aria-hidden="true" />
              <p className="text-corps text-steel-500">Rien à commander pour l’instant.</p>
            </div>
          ) : (
            <ul className="divide-y divide-rule">
              {calculs.aReapprovisionner.slice(0, 6).map((ligne) => {
                const { produit } = ligne.alerte;
                const statut = statutStock(ligne.quantite, produit.seuilAlerte);
                const fournisseur = produit.fournisseursAssocies[0]?.fournisseur;
                return (
                  <li
                    key={ligne.alerte.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 px-5 py-3.5 sm:grid-cols-[36px_minmax(0,1fr)_112px_88px_auto] sm:gap-x-3"
                  >
                    <Vignette nom={produit.nom} photoUrl={produit.photoUrl} />
                    <div className="min-w-0">
                      <Link
                        to={`/produits/${produit.id}`}
                        className="line-clamp-2 text-corps font-medium text-ink-900 hover:underline"
                      >
                        {produit.nom}
                      </Link>
                      <p className="mt-0.5 flex min-w-0 items-center gap-x-3 text-meta text-steel-500">
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <Truck className="size-3 shrink-0 text-steel-400" aria-hidden="true" />
                          <span className="truncate">{fournisseur?.nom ?? 'Sans fournisseur'}</span>
                        </span>
                        {ligne.emplacement && (
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <MapPin className="size-3 shrink-0 text-steel-400" aria-hidden="true" />
                            <span className="truncate">{ligne.emplacement}</span>
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 sm:contents">
                      <NiveauStock
                        quantite={ligne.quantite}
                        seuil={produit.seuilAlerte}
                        unite={produit.uniteMesure}
                        className="w-full"
                      />
                      <span className="sm:justify-self-start">
                        <Badge variant={varianteStatut[statut]}>{libelleStatut[statut]}</Badge>
                      </span>
                      <Button variant="secondary" taille="sm" onClick={() => commander(ligne)}>
                        Commander
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <PanneauEntete
            titre="Derniers mouvements"
            meta="Entrées, sorties et transferts récents"
            action={
              <Link to="/stock" className="shrink-0 text-corps font-medium text-action hover:underline">
                Historique
              </Link>
            }
          />
          {mouvements.isError ? (
            <p className="px-5 py-8 text-center text-corps text-steel-500">Mouvements indisponibles.</p>
          ) : (mouvements.data ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-corps text-steel-500">Aucun mouvement enregistré.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {(mouvements.data ?? []).slice(0, 7).map((m) => {
                const p = presentationMouvement[m.type];
                const lieu =
                  m.type === 'TRANSFERT' && m.emplacementDestination
                    ? `${m.emplacement.nom} vers ${m.emplacementDestination.nom}`
                    : m.emplacement.nom;
                return (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className={cn('flex size-[26px] shrink-0 items-center justify-center rounded-sm', p.fond)}
                      aria-hidden="true"
                    >
                      <p.Icone className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-corps font-medium text-ink-900">{m.produit.nom}</p>
                      <p className="truncate text-meta text-steel-500">
                        {p.libelle}, {lieu}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn('text-corps font-semibold', p.couleur)}>
                        {quantiteSignee(m.type, m.quantite)}
                      </p>
                      <p className="text-meta whitespace-nowrap text-steel-400">{tempsRelatif(m.createdAt, maintenant)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * Squelette du tableau de bord : mêmes blocs, mêmes proportions que
 * l'écran réel (bandeau, bande de mesures, deux panneaux). Les blocs
 * apparaissent l'un après l'autre, puis cèdent la place au contenu.
 */
function SqueletteTableauDeBord() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite">
      <span className="sr-only">Chargement du tableau de bord…</span>
      <div className="bandeau-action flex flex-col gap-6 rounded-lg px-5 py-6 sm:px-[26px]">
        <div className="flex flex-col gap-2.5">
          <span className="block h-6 w-72 max-w-full rounded-sm bg-white/10" />
          <span className="block h-3 w-56 max-w-full rounded-sm bg-white/[0.07]" />
        </div>
        <div className="flex gap-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2 border-l-2 border-white/14 pl-3">
              <span className="block h-6 w-8 rounded-sm bg-white/10" />
              <span className="block h-2.5 w-20 rounded-sm bg-white/[0.07]" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule shadow-card lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={i === 0 ? 'col-span-2 bg-surface px-5 py-4 lg:col-span-1' : 'bg-surface px-5 py-4'}>
            <Squelette className="h-2.5 w-24" />
            <Squelette className="mt-3 h-6 w-28" />
            <Squelette className="mt-3 h-2.5 w-32" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
        {[6, 5].map((lignes, i) => (
          <Card key={i}>
            <div className="border-b border-rule px-5 py-4">
              <Squelette className="h-3 w-36" />
              <Squelette className="mt-2 h-2.5 w-48" />
            </div>
            <LoadingState lignes={lignes} />
          </Card>
        ))}
      </div>
    </div>
  );
}
