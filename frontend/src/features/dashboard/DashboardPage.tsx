import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  CheckCircle2,
  MapPin,
  ShoppingCart,
  SlidersHorizontal,
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
import { ErrorState, LoadingState } from '@/components/patterns/States';
import { NiveauStock } from '@/components/patterns/NiveauStock';
import { Vignette } from '@/components/patterns/Vignette';
import { libelleStatut, statutStock, varianteStatut } from '@/components/patterns/statutStock';

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

interface LigneStock {
  produitId: string;
  quantite: number;
  produit: { prixAchat: number | null };
  emplacement: { nom: string };
}

interface Mouvement {
  id: string;
  type: 'ENTREE' | 'SORTIE' | 'TRANSFERT' | 'AJUSTEMENT';
  quantite: number;
  createdAt: string;
  produitId: string;
  produit: { nom: string };
  emplacement: { nom: string };
  emplacementDestination: { nom: string } | null;
}

interface Commande {
  id: string;
  statut: 'BROUILLON' | 'ENVOYEE' | 'RECUE' | 'ANNULEE';
}

interface Fournisseur {
  id: string;
  delaiLivraisonJours: number | null;
}

const JOUR_MS = 24 * 60 * 60 * 1000;
const NB_BARRES = 9;

/** Effet d'un mouvement sur la quantité totale d'un produit (tous emplacements). */
function variationQuantite(m: Mouvement): number {
  if (m.type === 'ENTREE') return m.quantite;
  if (m.type === 'SORTIE') return -m.quantite;
  // Un ajustement d'inventaire enregistre l'écart, déjà signé ; un
  // transfert ne change pas le total, seulement sa répartition.
  if (m.type === 'AJUSTEMENT') return m.quantite;
  return 0;
}

const presentationMouvement = {
  ENTREE: { libelle: 'Entrée', Icone: ArrowDownToLine, fond: 'bg-ok-wash text-ok', signe: '+', couleur: 'text-ok' },
  SORTIE: {
    libelle: 'Sortie',
    Icone: ArrowUpFromLine,
    fond: 'bg-faible-wash text-faible',
    signe: '−',
    couleur: 'text-faible',
  },
  TRANSFERT: {
    libelle: 'Transfert',
    Icone: ArrowRightLeft,
    fond: 'bg-action-wash text-action',
    signe: '',
    couleur: 'text-action',
  },
  AJUSTEMENT: {
    libelle: 'Ajustement',
    Icone: SlidersHorizontal,
    fond: 'bg-accent-wash text-accent',
    signe: '',
    couleur: 'text-accent',
  },
} as const;

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
  const stock = useQuery({
    queryKey: ['stock', ''],
    queryFn: async () => (await api.get<LigneStock[]>('/stock?')).data,
  });
  const mouvements = useQuery({
    queryKey: ['mouvements', ''],
    queryFn: async () => (await api.get<Mouvement[]>('/mouvements?')).data,
  });
  const commandes = useQuery({
    queryKey: ['commandes'],
    queryFn: async () => (await api.get<Commande[]>('/commandes')).data,
  });
  const fournisseurs = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: async () => (await api.get<Fournisseur[]>('/fournisseurs')).data,
  });

  // Instant de référence = dernière récupération des mouvements : stable
  // d'un rendu à l'autre, et cohérent avec les données affichées.
  const maintenant = mouvements.dataUpdatedAt || stock.dataUpdatedAt;

  const calculs = useMemo(() => {
    const lignesStock = stock.data ?? [];
    const listeMouvements = mouvements.data ?? [];

    // Quantité totale et emplacement le plus bas, par produit.
    const parProduit = new Map<string, { quantite: number; emplacementBas?: { nom: string; quantite: number } }>();
    const prixAchat = new Map<string, number>();
    let valeur = 0;
    let sansPrix = 0;
    for (const ligne of lignesStock) {
      const courant = parProduit.get(ligne.produitId) ?? { quantite: 0 };
      courant.quantite += ligne.quantite;
      if (!courant.emplacementBas || ligne.quantite < courant.emplacementBas.quantite) {
        courant.emplacementBas = { nom: ligne.emplacement.nom, quantite: ligne.quantite };
      }
      parProduit.set(ligne.produitId, courant);
      if (ligne.produit.prixAchat == null) {
        if (ligne.quantite > 0) sansPrix += 1;
      } else {
        prixAchat.set(ligne.produitId, ligne.produit.prixAchat);
        valeur += ligne.quantite * ligne.produit.prixAchat;
      }
    }

    // Sparkline : valeur immobilisée en fin de journée sur 9 jours,
    // reconstituée à rebours depuis la valeur actuelle en annulant les
    // mouvements de chaque jour (au prix d'achat actuel).
    const finDuJour = new Date(maintenant);
    finDuJour.setHours(23, 59, 59, 999);
    const serie: number[] = [];
    let valeurCourante = valeur;
    for (let i = 0; i < NB_BARRES; i += 1) {
      serie.unshift(valeurCourante);
      const debut = finDuJour.getTime() - (i + 1) * JOUR_MS;
      const fin = finDuJour.getTime() - i * JOUR_MS;
      for (const m of listeMouvements) {
        const t = new Date(m.createdAt).getTime();
        if (t > debut && t <= fin) {
          valeurCourante -= variationQuantite(m) * (prixAchat.get(m.produitId) ?? 0);
        }
      }
    }

    const semaine = listeMouvements.filter((m) => maintenant - new Date(m.createdAt).getTime() <= 7 * JOUR_MS).length;
    const semainePrecedente = listeMouvements.filter((m) => {
      const age = maintenant - new Date(m.createdAt).getTime();
      return age > 7 * JOUR_MS && age <= 14 * JOUR_MS;
    }).length;

    const delais = (fournisseurs.data ?? [])
      .map((f) => f.delaiLivraisonJours)
      .filter((d): d is number => d != null);
    const delaiMoyen = delais.length > 0 ? delais.reduce((a, b) => a + b, 0) / delais.length : null;

    const aReapprovisionner = (alertes.data ?? [])
      .map((alerte) => {
        const infos = parProduit.get(alerte.produit.id);
        return { alerte, quantite: infos?.quantite ?? 0, emplacement: infos?.emplacementBas?.nom };
      })
      // Ruptures d'abord, puis les produits les plus loin de leur seuil.
      .sort(
        (a, b) =>
          a.quantite / Math.max(a.alerte.produit.seuilAlerte, 1) - b.quantite / Math.max(b.alerte.produit.seuilAlerte, 1),
      );

    return {
      valeur,
      sansPrix,
      serie,
      semaine,
      ecartSemaine: semaine - semainePrecedente,
      delaiMoyen,
      nbDelais: delais.length,
      aReapprovisionner,
      ruptures: aReapprovisionner.filter((l) => l.quantite <= 0).length,
      enRoute: (commandes.data ?? []).filter((c) => c.statut === 'ENVOYEE').length,
    };
  }, [stock.data, mouvements.data, fournisseurs.data, alertes.data, commandes.data, maintenant]);

  if (overview.isLoading || alertes.isLoading || stock.isLoading) return <LoadingState />;
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
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-md bg-white px-4 text-corps font-semibold text-ink-900 transition-colors hover:bg-paper focus-visible:outline-white lg:self-end"
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
                        {m.type === 'AJUSTEMENT' ? (m.quantite > 0 ? '+' : '−') : p.signe}
                        {Math.abs(m.quantite)}
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
