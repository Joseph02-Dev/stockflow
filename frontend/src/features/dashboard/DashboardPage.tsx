import { useMemo, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  Package,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre, pluriel } from '@/lib/format';
import { trajetMouvement } from '@/lib/natureEmplacement';
import { useModules } from '@/lib/useModules';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { useSession } from '@/lib/useSession';
import { Card, PanneauEntete } from '@/components/patterns/Page';
import { Compteur } from '@/components/patterns/Compteur';
import { ErrorState, LoadingState, Squelette } from '@/components/patterns/States';
import { NiveauStock } from '@/components/patterns/NiveauStock';
import { Vignette } from '@/components/patterns/Vignette';
import { libelleStatut, statutStock, varianteStatut } from '@/components/patterns/statutStock';
import { libelleMouvement, presentationMouvement, quantiteSignee, type TypeMouvement } from '@/components/patterns/typeMouvement';
import { VentesSemaine } from './VentesSemaine';
import './dashboard.css';
import { FlecheLien } from '@/components/ui/LienAction';
import { lienActionClasses } from '@/components/ui/lienActionClasses';
import { BoutonNouvelleVente } from '@/components/patterns/BoutonNouvelleVente';

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
  vente: { numero: string } | null;
}

const NB_BARRES = 9;

/** Carte d'indicateur : posée, elle se soulève au survol. */
const CARTE_MESURE =
  'rounded-lg border border-rule bg-surface px-4 py-4 shadow-card transition-[transform,box-shadow] duration-200 ease-sortie hover:-translate-y-0.5 hover:shadow-pop motion-reduce:transform-none sm:px-5';

function EnteteMesure({ Icone, children }: { Icone: LucideIcon; children: string }) {
  return (
    <p className="flex items-center gap-2 text-meta font-medium text-steel-500">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-action-wash text-action ring-1 ring-action/10 ring-inset" aria-hidden="true">
        <Icone className="size-3.5" />
      </span>
      {children}
    </p>
  );
}

const jourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

function libelleJour(date: Date): string {
  const veille = new Date();
  veille.setDate(veille.getDate() - 1);
  if (date.toDateString() === new Date().toDateString()) return 'Aujourd’hui';
  if (date.toDateString() === veille.toDateString()) return 'Hier';
  return jourLong.format(date);
}

export function DashboardPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [aujourdhui] = useState(() => jourLong.format(new Date()));
  const prenom = session?.utilisateur.nom.split(' ')[0];
  const modules = useModules();

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

  const urgents = calculs.aReapprovisionner.slice(0, 3);
  const raccourcis = [
    {
      libelle: 'Entrée de stock',
      aide: 'Réception, transfert',
      Icone: Warehouse,
      teinte: 'var(--color-ok)',
      vers: '/stock',
      etat: { nouveauMouvement: true },
    },
    {
      libelle: 'Commande fournisseur',
      aide: 'Réapprovisionner',
      Icone: Truck,
      teinte: 'var(--color-accent)',
      vers: '/commandes/nouvelle',
    },
    {
      libelle: 'Ajouter un produit',
      aide: 'Au catalogue',
      Icone: Package,
      teinte: '#2f6fb3',
      vers: '/produits/nouveau',
    },
    ...(modules.inventaires
      ? [
          {
            libelle: 'Inventaire',
            aide: 'Compter un emplacement',
            Icone: ClipboardCheck,
            teinte: 'var(--color-action)',
            vers: '/stock',
            etat: { onglet: 'inventaires' },
          },
        ]
      : []),
  ];

  // Derniers mouvements regroupés par jour, du plus récent au plus ancien.
  const joursMouvements: { cle: string; date: Date; liste: Mouvement[] }[] = [];
  for (const m of mouvements.data ?? []) {
    const date = new Date(m.createdAt);
    const dernier = joursMouvements.at(-1);
    if (dernier?.cle === date.toDateString()) dernier.liste.push(m);
    else joursMouvements.push({ cle: date.toDateString(), date, liste: [m] });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Accueil : à qui l'on parle, où, quel jour ; les deux gestes les plus fréquents. */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-titre text-ink-900">{prenom ? `Bonjour, ${prenom}` : 'Tableau de bord'}</h1>
          <p className="mt-1 text-corps text-steel-500 first-letter:uppercase">
            {[aujourdhui, session?.entreprise.nom].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Link to="/statistiques" className={cn(boutonClasses('secondary'), 'flex-1 sm:flex-none')}>
            Statistiques
          </Link>
          <BoutonNouvelleVente />
        </div>
      </header>

      {/* Raccourcis vers les gestes de tous les jours, après la vente. */}
      <nav
        aria-label="Raccourcis"
        className={cn('grid grid-cols-2 gap-2.5', raccourcis.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}
      >
        {raccourcis.map(({ libelle, aide, Icone, teinte, vers, etat }) => (
          <Link
            key={libelle}
            to={vers}
            state={etat}
            className="tdb-raccourci text-corps font-semibold text-ink-900"
            style={{ '--teinte': teinte } as CSSProperties}
          >
            <span className="tdb-tuile" aria-hidden="true">
              <Icone className="size-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block truncate">{libelle}</span>
              <span className="hidden truncate text-meta font-medium text-steel-400 sm:block">{aide}</span>
            </span>
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <VentesSemaine />

        {/* Bandeau d'action — répond à « qu'est-ce qui va me manquer aujourd'hui ? » */}
        <section
          className="bandeau-action flex flex-col gap-5 rounded-xl px-5 py-6 text-white sm:px-6"
          aria-labelledby="titre-bandeau"
        >
          <span className="trame-grille pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
          <div>
            <h2
              id="titre-bandeau"
              className="font-display text-[1.375rem] leading-[1.2] font-semibold tracking-[-0.02em]"
            >
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

          <dl className="grid grid-cols-3 gap-2.5">
            {[
              {
                libelle: pluriel('Rupture', calculs.ruptures),
                valeur: calculs.ruptures,
                point: 'bg-rupture-vif',
              },
              {
                libelle: 'Sous le seuil',
                valeur: sousSeuil,
                point: 'bg-faible-vif',
              },
              {
                libelle: 'En route',
                valeur: calculs.enRoute,
                point: 'bg-white/50',
              },
            ].map((mesure) => (
              <div
                key={mesure.libelle}
                className="flex flex-col-reverse rounded-lg border border-white/8 bg-white/6 px-3 py-2.5"
              >
                <dt className="mt-1.5 flex items-center gap-1.5 text-meta text-white/65">
                  <i className={cn('size-[7px] shrink-0 rounded-full', mesure.point)} aria-hidden="true" />
                  {mesure.libelle}
                </dt>
                <dd className="text-chiffre">
                  <Compteur valeur={mesure.valeur} format={formatNombre} />
                </dd>
              </div>
            ))}
          </dl>

          {urgents.length > 0 && (
            <ul className="flex flex-col gap-1.5" aria-label="Les plus urgents">
              {urgents.map(({ alerte, quantite }) => (
                <li key={alerte.id} className="flex items-center justify-between gap-3 text-corps text-white/85">
                  <Link to={`/produits/${alerte.produit.id}`} className="truncate hover:underline">
                    {alerte.produit.nom}
                  </Link>
                  <span
                    className={cn(
                      'shrink-0 text-meta font-semibold whitespace-nowrap',
                      quantite <= 0 ? 'text-rupture-vif' : 'text-faible-vif',
                    )}
                  >
                    {formatNombre(quantite)} / seuil {alerte.produit.seuilAlerte}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/commandes/nouvelle"
            className={cn(boutonClasses('primary'), 'mt-auto self-start focus-visible:outline-white')}
          >
            <ShoppingCart className="size-4" aria-hidden="true" />
            Préparer les commandes
          </Link>
        </section>
      </div>

      {/* Mesures — une carte par indicateur, qui se soulève au survol. */}
      <section aria-label="Mesures" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className={cn(CARTE_MESURE, 'col-span-2 lg:col-span-1')}>
          <EnteteMesure Icone={Wallet}>Valeur immobilisée</EnteteMesure>
          <div className="mt-2.5 flex items-end justify-between gap-3">
            <p className="text-chiffre whitespace-nowrap text-ink-900">
              <Compteur valeur={calculs.valeur} format={formatNombre} />{' '}
              <span className="text-corps font-medium text-steel-400">GNF</span>
            </p>
            <div className="flex h-9 shrink-0 items-end gap-[3px]" aria-hidden="true">
              {calculs.serie.map((v, i) => (
                <span
                  key={i}
                  className={cn(
                    'barre-croissance w-[5px] rounded-[2px]',
                    i === NB_BARRES - 1 ? 'bg-action' : 'bg-action/25',
                  )}
                  style={
                    {
                      height: `${Math.max(12, (v / maxSerie) * 100)}%`,
                      '--i': i,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          </div>
          <p className="mt-1 text-meta text-steel-400">
            {calculs.sansPrix > 0
              ? `Au prix d’achat, ${calculs.sansPrix} ${pluriel('ligne', calculs.sansPrix)} sans prix`
              : 'Au prix d’achat, sur 9 jours'}
          </p>
        </div>

        <div className={CARTE_MESURE}>
          <EnteteMesure Icone={ArrowLeftRight}>Mouvements 7 jours</EnteteMesure>
          <p className="mt-2.5 text-chiffre text-ink-900">
            <Compteur valeur={kpi.mouvements7Jours} format={formatNombre} />
          </p>
          <p
            className={cn(
              'mt-1 flex items-center gap-1 text-meta',
              calculs.ecartSemaine >= 0 ? 'text-ok' : 'text-steel-500',
            )}
          >
            {calculs.ecartSemaine >= 0 ? (
              <TrendingUp className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <TrendingDown className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            {calculs.ecartSemaine >= 0 ? '+' : '−'}
            {Math.abs(calculs.ecartSemaine)} vs semaine précédente
          </p>
        </div>

        <div className={CARTE_MESURE}>
          <EnteteMesure Icone={Package}>Références actives</EnteteMesure>
          <p className="mt-2.5 text-chiffre text-ink-900">
            <Compteur valeur={kpi.produitsActifs} format={formatNombre} />
          </p>
          <p className="mt-1 text-meta text-steel-400">
            {formatNombre(kpi.quantiteTotaleEnStock)} {pluriel('unité', kpi.quantiteTotaleEnStock)} en stock
          </p>
        </div>

        <div className={cn(CARTE_MESURE, 'col-span-2 lg:col-span-1')}>
          <EnteteMesure Icone={Truck}>Délai fournisseur moyen</EnteteMesure>
          <p className="mt-2.5 text-chiffre text-ink-900">
            {calculs.delaiMoyen == null ? (
              '—'
            ) : (
              <>
                {calculs.delaiMoyen.toLocaleString('fr-FR', {
                  maximumFractionDigits: 1,
                })}{' '}
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

      {/* Deux colonnes : ce qu'il faut commander, ce qui vient de bouger. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
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
                <Link to="/alertes" className={lienActionClasses()}>
                  Voir par fournisseur
                <FlecheLien /></Link>
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
            meta="Entrées, ventes et transferts récents"
            action={
              <Link
                to="/stock"
                state={{ onglet: 'mouvements' }}
                className={lienActionClasses()}
              >
                Historique
              <FlecheLien /></Link>
            }
          />
          {mouvements.isError ? (
            <p className="px-5 py-8 text-center text-corps text-steel-500">Mouvements indisponibles.</p>
          ) : joursMouvements.length === 0 ? (
            <p className="px-5 py-8 text-center text-corps text-steel-500">Aucun mouvement enregistré.</p>
          ) : (
            <div className="pt-1 pb-2">
              {joursMouvements.map((jour) => (
                <section key={jour.cle} aria-label={libelleJour(jour.date)}>
                  <h3 className="px-5 pt-2.5 pb-1 text-meta font-semibold tracking-[0.04em] text-steel-400 uppercase">
                    {libelleJour(jour.date)}
                  </h3>
                  <ul>
                    {jour.liste.map((m) => {
                      const p = presentationMouvement[m.type];
                      return (
                        <li key={m.id} className="tdb-mvt">
                          <span className={cn('tdb-pastille', p.fond)} aria-hidden="true">
                            <p.Icone className="size-[15px]" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-corps font-semibold text-ink-900">{m.produit.nom}</p>
                            <p className="truncate text-meta text-steel-500">
                              {m.vente ? `${libelleMouvement(m)} · ${m.emplacement.nom}` : trajetMouvement(m)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={cn('font-mono text-corps font-semibold', p.couleur)}>
                              {quantiteSignee(m.type, m.quantite)}
                            </p>
                            <p className="font-mono text-meta text-steel-400">{heure.format(new Date(m.createdAt))}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
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
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <span className="sr-only">Chargement du tableau de bord…</span>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-rule bg-surface px-3.5 py-3 shadow-card"
          >
            <Squelette className="size-9 rounded-[10px]" />
            <Squelette className="h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-rule bg-surface p-5 shadow-card">
          <Squelette className="h-3 w-32" />
          <Squelette className="mt-3 h-9 w-48" />
          <Squelette className="mt-6 h-[150px] w-full" />
        </div>
        <div className="bandeau-action flex flex-col gap-6 rounded-xl px-5 py-6 sm:px-6">
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
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'rounded-lg border border-rule bg-surface px-5 py-4 shadow-card',
              i === 0 && 'col-span-2 lg:col-span-1',
            )}
          >
            <Squelette className="h-2.5 w-24" />
            <Squelette className="mt-3 h-6 w-28" />
            <Squelette className="mt-3 h-2.5 w-32" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
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
