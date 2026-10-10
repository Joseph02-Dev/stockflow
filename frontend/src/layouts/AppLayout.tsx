import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ChartLine,
  CircleHelp,
  MapPin,
  Search,
  PackageX,
  ChevronRight,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Settings,
  Tag,
  Truck,
  UserRound,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { clearSession, getSession } from '@/lib/session';
import { useSession } from '@/lib/useSession';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/patterns/Logo';
import { ProfilModal } from '@/features/profil/ProfilModal';
import { useSynchronisation } from '@/lib/useSynchronisation';
import { BarreProgression } from '@/components/patterns/BarreProgression';
import { useModules } from '@/lib/useModules';
import { SelecteurTheme } from '@/components/patterns/SelecteurTheme';
import { OngletsSection, type OngletSection } from '@/components/patterns/OngletsSection';

// Navigation en quatre sections : piloter, gérer le stock, s'approvisionner,
// organiser. Les liens réservés à l'Admin (Paramètres et ses onglets) et
// au module Rapports sont filtrés à l'affichage.
type Lien = {
  to: string;
  libelle: string;
  Icone: typeof LayoutDashboard;
  exact?: boolean;
  admin?: boolean;
  module?: 'rapports';
  /** Pages réunies sous ce lien (onglets de la section) : le lien reste actif sur chacune. */
  aussi?: string[];
};

const sectionsNav: { titre: string; liens: Lien[] }[] = [
  {
    titre: 'Pilotage',
    liens: [
      { to: '/', libelle: 'Tableau de bord', Icone: LayoutDashboard, exact: true },
      { to: '/statistiques', libelle: 'Statistiques', Icone: ChartLine },
      { to: '/alertes', libelle: 'Alertes', Icone: Bell, aussi: ['/peremptions'] },
      { to: '/ventes', libelle: 'Ventes', Icone: Receipt },
    ],
  },
  {
    titre: 'Gestion du stock',
    liens: [
      { to: '/produits', libelle: 'Produits', Icone: Package },
      { to: '/stock', libelle: 'Stock & mouvements', Icone: Warehouse },
      { to: '/pertes', libelle: 'Pertes', Icone: PackageX },
    ],
  },
  {
    titre: 'Approvisionnement',
    liens: [
      { to: '/commandes', libelle: 'Commandes & retours', Icone: ClipboardList, aussi: ['/retours-fournisseur'] },
      { to: '/fournisseurs', libelle: 'Fournisseurs', Icone: Truck },
    ],
  },
  {
    titre: 'Organisation',
    liens: [
      { to: '/emplacements', libelle: 'Emplacements', Icone: MapPin, admin: true },
      { to: '/parametres', libelle: 'Paramètres', Icone: Settings, admin: true },
      { to: '/rapports', libelle: 'Rapports', Icone: FileText, module: 'rapports' },
      { to: '/clients', libelle: 'Clients & créances', Icone: Users, aussi: ['/creances'] },
      { to: '/categories', libelle: 'Catégories & marques', Icone: Tag, admin: true },
    ],
  },
];

/** Adresse d'assistance : celle des réponses aux emails de StockFlow. */
const ADRESSE_AIDE = 'contact@stockflowgn.com';

// Les 4 destinations les plus fréquentes uniquement : la barre mobile
// n'a la place que pour ça sans devenir illisible. La vente au comptoir
// est le premier usage mobile : elle prend la place de Produits, qui
// rejoint Fournisseurs, Clients, Catégories/Marques et Paramètres dans « Plus ».
const navMobile = [
  { to: '/', libelle: 'Vue d’ensemble', Icone: LayoutDashboard, exact: true },
  { to: '/ventes', libelle: 'Ventes', Icone: Receipt },
  { to: '/stock', libelle: 'Stock', Icone: Warehouse },
  { to: '/commandes', libelle: 'Commandes', Icone: ClipboardList },
];

/**
 * Fil d'Ariane : libellé de la section courante, et le niveau de détail
 * éventuel (création, fiche). Dérivé du chemin pour ne pas obliger
 * chaque page à le déclarer.
 */
function filAriane(chemin: string): { libelle: string; to?: string }[] {
  const sections: Record<string, string> = {
    produits: 'Produits',
    stock: 'Stock & mouvements',
    inventaires: 'Stock & mouvements',
    alertes: 'Alertes',
    commandes: 'Commandes & retours',
    fournisseurs: 'Fournisseurs',
    clients: 'Clients & créances',
    ventes: 'Ventes',
    creances: 'Créances',
    peremptions: 'Péremptions',
    pertes: 'Pertes',
    'retours-fournisseur': 'Retours fournisseur',
    rapports: 'Rapports',
    statistiques: 'Statistiques',
    parametres: 'Paramètres',
    emplacements: 'Emplacements',
    categories: 'Catégories & marques',
  };
  const [racine, detail] = chemin.split('/').filter(Boolean);
  if (!racine) return [{ libelle: 'Tableau de bord' }];
  // Pages réunies en onglets : la section parente, puis l'onglet.
  const parents: Record<string, { libelle: string; to: string }> = {
    peremptions: { libelle: 'Alertes', to: '/alertes' },
    creances: { libelle: 'Clients & créances', to: '/clients' },
    'retours-fournisseur': { libelle: 'Commandes & retours', to: '/commandes' },
  };
  if (parents[racine] && !detail) return [parents[racine], { libelle: sections[racine] }];
  const section = sections[racine] ?? 'StockFlow';
  if (!detail) return [{ libelle: section }];

  const parent = racine === 'inventaires' ? '/stock' : `/${racine}`;
  // Pages d'action dont le libellé ne dépend pas de la section.
  const pagesAction: Record<string, string> = { import: 'Importer un catalogue', declarer: 'Déclarer une casse' };
  const libelleDetail =
    pagesAction[detail] ??
    (detail === 'nouveau' || detail === 'nouvelle'
      ? racine === 'commandes'
        ? 'Nouvelle commande'
        : racine === 'ventes'
          ? 'Nouvelle vente'
          : 'Nouveau produit'
      : ((
          {
            inventaires: 'Inventaire',
            commandes: 'Commande',
            fournisseurs: 'Fournisseur',
            ventes: 'Vente',
            produits: 'Fiche produit',
          } as Record<string, string>
        )[racine] ?? 'Fiche'));
  return [{ libelle: section, to: parent }, { libelle: libelleDetail }];
}

function LienNav({
  to,
  libelle,
  Icone,
  exact,
  nombreAlertes,
  nombrePeremptions = 0,
  onNaviguer,
  actifForce,
}: {
  to: string;
  libelle: string;
  Icone: typeof LayoutDashboard;
  exact?: boolean;
  nombreAlertes: number;
  /** Lots sous surveillance (péremption dans le seuil, périmés compris). */
  nombrePeremptions?: number;
  onNaviguer?: () => void;
  /**
   * Remplace la détection automatique de React Router. Nécessaire quand
   * deux liens pointent vers le même chemin avec des paramètres de
   * requête différents (Catégories & marques / Paramètres pointent tous
   * deux vers /parametres) — sans ça, les deux s'allument en même temps.
   */
  actifForce?: boolean;
}) {
  const estAlertes = to === '/alertes';
  const classes = (actif: boolean) =>
    cn(
      'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-corps font-medium transition-colors',
      'focus-visible:outline-white/70',
      actif ? 'bg-action text-sur-couleur' : 'text-white/70 hover:bg-white/5 hover:text-white',
    );

  const contenu = (
    <>
      <Icone className="size-[17px] shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate">{libelle}</span>
      {estAlertes && nombreAlertes > 0 && (
        <span
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rupture px-1.5 text-meta font-semibold text-sur-couleur"
          aria-label={`${nombreAlertes} alerte${nombreAlertes > 1 ? 's' : ''} active${nombreAlertes > 1 ? 's' : ''}`}
        >
          {nombreAlertes}
        </span>
      )}
      {estAlertes && nombrePeremptions > 0 && (
        <span
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-faible px-1.5 text-meta font-semibold text-sur-couleur"
          aria-label={`${nombrePeremptions} lot${nombrePeremptions > 1 ? 's' : ''} sous surveillance`}
        >
          {nombrePeremptions}
        </span>
      )}
    </>
  );

  if (actifForce !== undefined) {
    return (
      <NavLink to={to} onClick={onNaviguer} className={classes(actifForce)} aria-current={actifForce ? 'page' : undefined}>
        {contenu}
      </NavLink>
    );
  }

  return (
    <NavLink to={to} end={exact} onClick={onNaviguer} className={({ isActive }) => classes(isActive)}>
      {contenu}
    </NavLink>
  );
}

function SectionNav({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {/* Intitulé de section en casse normale : un repère discret, pas un cri. */}
      <span className="px-2.5 pb-1.5 text-meta font-medium text-steel-400">{titre}</span>
      {children}
    </div>
  );
}

const classesLienPlus =
  'flex h-12 items-center gap-3 rounded-md px-3 text-corps font-medium text-ink-900 hover:bg-survol';

export function AppLayout() {
  const session = useSession();
  const modules = useModules();
  const navigate = useNavigate();
  const location = useLocation();
  const [profilOuvert, setProfilOuvert] = useState(false);
  const { statut: statutSynchro, nombreEnAttente } = useSynchronisation();
  const [plusOuvert, setPlusOuvert] = useState(false);

  const [recherche, setRecherche] = useState('');

  const ariane = filAriane(location.pathname);
  const sousChemin = (chemin: string) => location.pathname === chemin || location.pathname.startsWith(`${chemin}/`);

  // Compteur d'alertes actives — partage la clé de cache avec la page
  // Alertes, donc tout mouvement de stock qui l'invalide met aussi la
  // pastille à jour automatiquement.
  const alertesActives = useQuery({
    queryKey: ['alertes', 'ACTIVE'],
    queryFn: async () => (await api.get<unknown[]>('/alertes?statut=ACTIVE')).data,
  });
  const nombreAlertes = alertesActives.data?.length ?? 0;
  // Même clé que l'écran Péremptions : une sortie de lot y met la pastille à jour.
  const peremptions = useQuery({
    queryKey: ['peremptions', 'resume'],
    queryFn: async () => (await api.get<{ sousSurveillance: number }>('/peremptions')).data,
    staleTime: 5 * 60_000,
  });
  const nombrePeremptions = peremptions.data?.sousSurveillance ?? 0;

  // Sections réunies : une entrée de menu, des onglets en haut de chaque page.
  const groupes: { libelle: string; onglets: OngletSection[] }[] = [
    {
      libelle: 'Alertes',
      onglets: [
        { to: '/alertes', libelle: 'Stock', compteur: nombreAlertes },
        { to: '/peremptions', libelle: 'Péremptions', compteur: nombrePeremptions },
      ],
    },
    {
      libelle: 'Clients et créances',
      onglets: [
        { to: '/clients', libelle: 'Clients' },
        { to: '/creances', libelle: 'Créances' },
      ],
    },
    {
      libelle: 'Commandes et retours',
      onglets: [
        { to: '/commandes', libelle: 'Commandes' },
        { to: '/retours-fournisseur', libelle: 'Retours fournisseur' },
      ],
    },
  ];
  const ongletsSection = groupes.find((g) => g.onglets.some((o) => o.to === location.pathname));

  async function seDeconnecter() {
    const courante = getSession();
    try {
      if (courante) {
        await api.post('/auth/logout', { refreshToken: courante.refreshToken });
      }
    } catch {
      // La déconnexion locale doit aboutir même si l'appel serveur échoue.
    } finally {
      clearSession();
      navigate('/connexion', { replace: true });
    }
  }

  const initiales = session?.utilisateur.nom
    .split(' ')
    .map((partie) => partie[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const initialesEntreprise = session?.entreprise.nom
    .split(/\s+/)
    .filter(Boolean)
    .map((partie) => partie[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Recherche de la barre supérieure : ouvre la liste des produits filtrée.
  function rechercher(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const terme = recherche.trim();
    if (!terme) return;
    navigate(`/produits?q=${encodeURIComponent(terme)}`);
    setRecherche('');
  }

  const libelleReseau =
    statutSynchro === 'hors-ligne'
      ? nombreEnAttente > 0
        ? `Hors ligne, ${nombreEnAttente} en attente`
        : 'Hors ligne'
      : statutSynchro === 'synchronisation'
        ? 'Synchronisation…'
        : 'En ligne';

  return (
    <div className="flex min-h-full">
      <BarreProgression />
      {/* Sidebar desktop — encre, collée à la hauteur de l'écran. */}
      <aside className="barre-laterale sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col bg-ink-800 md:flex">
        <div className="flex flex-col gap-4 px-3.5 pt-4 pb-4">
          <Link to="/" className="flex items-center gap-2.5 rounded-md px-1.5 text-white focus-visible:outline-white/70">
            <Logo taille={30} />
            <span className="text-panneau">StockFlow</span>
          </Link>
          <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-meta font-bold text-white"
              aria-hidden="true"
            >
              {initialesEntreprise}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-corps font-semibold text-white">{session?.entreprise.nom}</span>
              <span className="block truncate text-meta text-white/60">Espace de gestion</span>
            </span>
          </div>
        </div>

        <nav
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-3 [scrollbar-color:rgb(255_255_255/0.2)_transparent] [scrollbar-width:thin]"
          aria-label="Navigation principale"
        >
          {sectionsNav.map((section) => {
            const liens = section.liens.filter(
              (lien) =>
                (!lien.admin || session?.utilisateur.role === 'ADMIN') && (lien.module !== 'rapports' || modules.rapports),
            );
            if (liens.length === 0) return null;
            return (
              <SectionNav key={section.titre} titre={section.titre}>
                {liens.map((lien) => (
                  <LienNav
                    key={lien.to}
                    to={lien.to}
                    libelle={lien.libelle}
                    Icone={lien.Icone}
                    exact={lien.exact}
                    nombreAlertes={nombreAlertes}
                    nombrePeremptions={nombrePeremptions}
                    actifForce={lien.aussi ? [lien.to, ...lien.aussi].some(sousChemin) : undefined}
                  />
                ))}
              </SectionNav>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 border-t border-white/[0.08] p-2.5">
          <button
            type="button"
            onClick={() => setProfilOuvert(true)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-white/5 focus-visible:outline-white/70"
          >
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-action text-meta font-semibold text-sur-couleur">
              {session?.utilisateur.photoUrl ? (
                <img src={session.utilisateur.photoUrl} alt="" className="size-full object-cover" />
              ) : (
                initiales
              )}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-corps font-semibold text-white">{session?.utilisateur.nom}</span>
              <span className="block truncate text-meta text-white/60">
                {session?.utilisateur.role === 'ADMIN' ? 'Administrateur' : 'Gestionnaire'}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={seDeconnecter}
            aria-label="Déconnexion"
            title="Déconnexion"
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-white/70"
          >
            <LogOut className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Verre dépoli : le contenu défile sous la barre, légèrement visible. */}
        <header className="sticky top-0 z-30 flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-rule/70 bg-surface/80 px-4 backdrop-blur-xl backdrop-saturate-150 md:px-7">
          <Link to="/" className="flex min-w-0 items-center gap-2.5 md:hidden">
            <Logo taille={28} />
            <span className="truncate text-panneau text-ink-900">{session?.entreprise.nom}</span>
          </Link>

          <nav aria-label="Fil d’Ariane" className="hidden min-w-0 md:block">
            <ol className="flex items-center gap-1.5 text-corps">
              <li className="truncate text-steel-500">{session?.entreprise.nom}</li>
              {ariane.map((etape, index) => (
                <Fragment key={etape.libelle}>
                  <ChevronRight className="size-3.5 shrink-0 text-steel-400" aria-hidden="true" />
                  <li className="truncate">
                    {etape.to ? (
                      <Link to={etape.to} className="text-steel-500 hover:text-ink-900">
                        {etape.libelle}
                      </Link>
                    ) : (
                      <span
                        className="font-medium text-ink-900"
                        aria-current={index === ariane.length - 1 ? 'page' : undefined}
                      >
                        {etape.libelle}
                      </span>
                    )}
                  </li>
                </Fragment>
              ))}
            </ol>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            <form role="search" onSubmit={rechercher} className="relative hidden lg:block">
              <label htmlFor="recherche-globale" className="sr-only">
                Rechercher un produit
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel-400"
                aria-hidden="true"
              />
              <input
                id="recherche-globale"
                type="search"
                value={recherche}
                onChange={(event) => setRecherche(event.target.value)}
                placeholder="Rechercher un produit"
                className="h-9 w-64 rounded-md border border-rule-strong bg-paper pr-3 pl-9 text-corps text-ink-900 placeholder:text-steel-400 focus:border-action focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-action/25"
              />
            </form>
            <SelecteurTheme className="hidden md:inline-flex" />
            <SelecteurTheme compact className="inline-flex md:hidden" />
            <span className="hidden items-center gap-1.5 px-1.5 text-meta text-steel-500 md:inline-flex" role="status">
              <span
                className={cn(
                  'inline-flex size-2 shrink-0 rounded-full',
                  statutSynchro === 'hors-ligne'
                    ? 'bg-rupture'
                    : statutSynchro === 'synchronisation'
                      ? 'animate-pulse bg-faible'
                      : 'bg-reseau',
                )}
                aria-hidden="true"
              />
              {libelleReseau}
            </span>
            <a
              href={`mailto:${ADRESSE_AIDE}`}
              aria-label={`Aide : écrire à ${ADRESSE_AIDE}`}
              title="Aide"
              className="hidden size-9 items-center justify-center rounded-md text-steel-700 transition-colors hover:bg-survol hover:text-ink-900 md:inline-flex"
            >
              <CircleHelp className="size-[18px]" aria-hidden="true" />
            </a>
            <Link
              to="/alertes"
              aria-label={
                nombreAlertes > 0
                  ? `Alertes : ${nombreAlertes} active${nombreAlertes > 1 ? 's' : ''}`
                  : 'Alertes : aucune active'
              }
              title="Alertes"
              className="relative inline-flex size-9 items-center justify-center rounded-md text-steel-700 transition-colors hover:bg-survol hover:text-ink-900"
            >
              <Bell className="size-[18px]" aria-hidden="true" />
              {nombreAlertes > 0 && (
                <span
                  className="absolute top-1.5 right-1.5 size-2 rounded-full bg-rupture ring-2 ring-surface"
                  aria-hidden="true"
                />
              )}
            </Link>
            <button
              type="button"
              onClick={() => setPlusOuvert(true)}
              aria-label="Menu"
              aria-expanded={plusOuvert}
              className="inline-flex size-10 items-center justify-center rounded-md border border-rule bg-surface/60 text-ink-900 transition-colors hover:bg-survol md:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pt-5 pb-24 md:px-7 md:pt-7 md:pb-10">
          {/* Clé = route : chaque changement d'écran rejoue l'entrée échelonnée des blocs. */}
          <div key={location.pathname} className="entree-page mx-auto w-full max-w-[1280px]">
            {ongletsSection && <OngletsSection onglets={ongletsSection.onglets} libelle={ongletsSection.libelle} />}
            <Outlet />
          </div>
        </main>
      </div>

      {/* Barre de navigation mobile : verre dépoli, onglet actif en pastille. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-rule/70 bg-surface/80 px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+6px)] shadow-[0_-10px_30px_-18px_rgba(16,24,40,0.35)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
        aria-label="Navigation principale"
      >
        {navMobile.map(({ to, libelle, Icone, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              cn(
                'group flex flex-1 flex-col items-center gap-1 py-1 text-meta font-medium transition-colors',
                isActive ? 'text-action' : 'text-steel-500',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                    isActive ? 'bg-action-wash' : 'group-hover:bg-survol',
                  )}
                >
                  <Icone className="size-5" aria-hidden="true" />
                </span>
                {libelle}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {plusOuvert && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-voile/50 backdrop-blur-[2px]" onClick={() => setPlusOuvert(false)} aria-hidden="true" />
          {/* Le menu descend du bouton qui l'ouvre, en haut à droite. */}
          <div className="absolute inset-x-0 top-0 max-h-[85dvh] overflow-y-auto rounded-b-xl border-b border-rule/70 bg-surface/95 p-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-4 shadow-pop backdrop-blur-xl">
            <div className="mb-1 flex items-center justify-between px-3">
              <span className="text-panneau text-ink-900">Menu</span>
              <button
                type="button"
                onClick={() => setPlusOuvert(false)}
                aria-label="Fermer le menu"
                className="inline-flex size-10 items-center justify-center rounded-md text-steel-700 hover:bg-survol"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <NavLink to="/statistiques" onClick={() => setPlusOuvert(false)} className={classesLienPlus}>
              <ChartLine className="size-5 text-steel-500" aria-hidden="true" />
              Statistiques
            </NavLink>
            <NavLink to="/pertes" onClick={() => setPlusOuvert(false)} className={classesLienPlus}>
              <PackageX className="size-5 text-steel-500" aria-hidden="true" />
              Pertes
            </NavLink>
            <NavLink to="/produits" onClick={() => setPlusOuvert(false)} className={classesLienPlus}>
              <Package className="size-5 text-steel-500" aria-hidden="true" />
              Produits
            </NavLink>
            {modules.rapports && (
              <NavLink to="/rapports" onClick={() => setPlusOuvert(false)} className={classesLienPlus}>
                <FileText className="size-5 text-steel-500" aria-hidden="true" />
                Rapports
              </NavLink>
            )}
            <NavLink to="/fournisseurs" onClick={() => setPlusOuvert(false)} className={classesLienPlus}>
              <Truck className="size-5 text-steel-500" aria-hidden="true" />
              Fournisseurs
            </NavLink>
            <NavLink to="/clients" onClick={() => setPlusOuvert(false)} className={classesLienPlus}>
              <Users className="size-5 text-steel-500" aria-hidden="true" />
              Clients & créances
            </NavLink>
            {session?.utilisateur.role === 'ADMIN' && (
              <>
                <NavLink
                  to="/emplacements"
                  onClick={() => setPlusOuvert(false)}
                  className={classesLienPlus}
                >
                  <MapPin className="size-5 text-steel-500" aria-hidden="true" />
                  Emplacements
                </NavLink>
                <NavLink
                  to="/categories"
                  onClick={() => setPlusOuvert(false)}
                  className={classesLienPlus}
                >
                  <Tag className="size-5 text-steel-500" aria-hidden="true" />
                  Catégories & marques
                </NavLink>
                <NavLink to="/parametres" onClick={() => setPlusOuvert(false)} className={classesLienPlus}>
                  <Settings className="size-5 text-steel-500" aria-hidden="true" />
                  Paramètres
                </NavLink>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setPlusOuvert(false);
                setProfilOuvert(true);
              }}
              className={cn(classesLienPlus, 'w-full text-left')}
            >
              <UserRound className="size-5 text-steel-500" aria-hidden="true" />
              Mon profil
            </button>
            <button type="button" onClick={seDeconnecter} className={cn(classesLienPlus, 'w-full text-left')}>
              <LogOut className="size-5 text-steel-500" aria-hidden="true" />
              Déconnexion
            </button>
            <div className="mt-3 flex items-center gap-2 border-t border-rule px-3 pt-3 text-meta text-steel-500">
              <span
                className={cn(
                  'inline-flex size-2 rounded-full',
                  statutSynchro === 'hors-ligne'
                    ? 'bg-rupture'
                    : statutSynchro === 'synchronisation'
                      ? 'bg-faible'
                      : 'bg-ok',
                )}
                aria-hidden="true"
              />
              {libelleReseau}
            </div>
          </div>
        </div>
      )}

      <ProfilModal ouvert={profilOuvert} onFermer={() => setProfilOuvert(false)} />
    </div>
  );
}
