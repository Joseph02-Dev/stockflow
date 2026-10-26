import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Bot,
  ChartLine,
  CircleHelp,
  MapPin,
  Search,
  PackageX,
  ChevronRight,
  ClipboardList,
  EllipsisVertical,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Receipt,
  RefreshCw,
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
import { IndicateurSynchro } from '@/features/synchronisation/IndicateurSynchro';
import { useSynchronisation } from '@/lib/useSynchronisation';
import { usePrechargementHorsLigne } from '@/lib/usePrechargementHorsLigne';
import { synchroniserBaseLocale, useSynchronisationLocale } from '@/lib/useSynchronisationLocale';
import { prechargerEcrans } from '@/lib/prechargementHorsLigne';
import { BarreProgression } from '@/components/patterns/BarreProgression';
import { useModules } from '@/lib/useModules';
import { ADRESSE_AIDE } from '@/lib/contact';
import { SelecteurTheme } from '@/components/patterns/SelecteurTheme';
import { BoutonInstaller } from '@/features/installation/BoutonInstaller';
import { AssistantPanel } from '@/features/assistant/AssistantPanel';
import { ClocheNotifications } from '@/features/notifications/ClocheNotifications';
import { desactiverPush, resynchroniserPush } from '@/lib/notificationsPush';
import { OngletsSection, type OngletSection } from '@/components/patterns/OngletsSection';
import { useIndicateurGlissant } from '@/components/patterns/useIndicateurGlissant';
import './menuMobile.css';

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
      { to: '/statistiques', libelle: 'Statistiques', Icone: ChartLine, aussi: ['/valorisation', '/rotation'] },
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
      { to: '/commandes', libelle: 'Commandes & retours', Icone: ClipboardList, aussi: ['/retours-fournisseur', '/reapprovisionnement'] },
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
    reapprovisionnement: 'Réapprovisionnement',
    valorisation: 'Valorisation',
    rotation: 'Rotation',
    rapports: 'Rapports',
    statistiques: 'Statistiques',
    parametres: 'Paramètres',
    emplacements: 'Emplacements',
    categories: 'Catégories & marques',
  };
  const [racine, detail, sousDetail] = chemin.split('/').filter(Boolean);
  if (!racine) return [{ libelle: 'Tableau de bord' }];
  // Modèles à variantes : Produits › Modèles › fiche du modèle.
  if (racine === 'produits' && detail === 'modeles') {
    const modeles = { libelle: 'Modèles', to: '/produits/modeles' };
    if (!sousDetail) return [{ libelle: 'Produits', to: '/produits' }, { libelle: 'Modèles' }];
    return [
      { libelle: 'Produits', to: '/produits' },
      modeles,
      { libelle: sousDetail === 'nouveau' ? 'Nouveau modèle' : 'Fiche modèle' },
    ];
  }
  // Pages réunies en onglets : la section parente, puis l'onglet.
  const parents: Record<string, { libelle: string; to: string }> = {
    peremptions: { libelle: 'Alertes', to: '/alertes' },
    creances: { libelle: 'Clients & créances', to: '/clients' },
    'retours-fournisseur': { libelle: 'Commandes & retours', to: '/commandes' },
    reapprovisionnement: { libelle: 'Commandes & retours', to: '/commandes' },
    valorisation: { libelle: 'Statistiques', to: '/statistiques' },
    rotation: { libelle: 'Statistiques', to: '/statistiques' },
  };
  if (parents[racine] && !detail) return [parents[racine], { libelle: sections[racine] }];
  const section = sections[racine] ?? 'NimbaFlow';
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

/** Bulle affichée à droite d'un élément de la barre réduite. */
type Bulle = { texte: string; haut: number; gauche: number };

/** Préférence de la barre latérale (réduite ou déployée), mémorisée par navigateur. */
const CLE_BARRE_REPLIEE = 'stockflow.barreRepliee';

function lireBarreRepliee(): boolean {
  try {
    return localStorage.getItem(CLE_BARRE_REPLIEE) === '1';
  } catch {
    // Stockage indisponible (navigation privée stricte) : barre déployée.
    return false;
  }
}

function enregistrerBarreRepliee(replie: boolean) {
  try {
    localStorage.setItem(CLE_BARRE_REPLIEE, replie ? '1' : '0');
  } catch {
    // Préférence de confort : ne rien bloquer si elle ne peut être gardée.
  }
}

/**
 * Props à poser sur un élément de la barre réduite : la bulle portant son
 * libellé s'affiche au survol comme au focus clavier. Position fixe, car la
 * liste défile et rognerait une bulle positionnée en absolu.
 */
function propsBulle(texte: string, replie: boolean, onBulle: (bulle: Bulle | null) => void) {
  if (!replie) return {};
  const montrer = (event: React.SyntheticEvent<HTMLElement>) => {
    const zone = event.currentTarget.getBoundingClientRect();
    onBulle({ texte, haut: zone.top + zone.height / 2, gauche: zone.right + 12 });
  };
  const cacher = () => onBulle(null);
  return { onMouseEnter: montrer, onMouseLeave: cacher, onFocus: montrer, onBlur: cacher };
}

function LienNav({
  to,
  libelle,
  Icone,
  exact,
  nombreAlertes,
  nombrePeremptions = 0,
  actifForce,
  replie,
  onBulle,
}: {
  to: string;
  libelle: string;
  Icone: typeof LayoutDashboard;
  exact?: boolean;
  nombreAlertes: number;
  /** Lots sous surveillance (péremption dans le seuil, périmés compris). */
  nombrePeremptions?: number;
  /**
   * Remplace la détection automatique de React Router, pour un lien qui
   * reste actif sur les pages réunies sous lui (onglets de section).
   */
  actifForce?: boolean;
  /** Barre réduite : icône seule, libellé dans une bulle. */
  replie: boolean;
  onBulle: (bulle: Bulle | null) => void;
}) {
  const estAlertes = to === '/alertes';
  const signalements = estAlertes ? nombreAlertes + nombrePeremptions : 0;
  const description = [
    estAlertes &&
      nombreAlertes > 0 &&
      `${nombreAlertes} alerte${nombreAlertes > 1 ? 's' : ''} active${nombreAlertes > 1 ? 's' : ''}`,
    estAlertes &&
      nombrePeremptions > 0 &&
      `${nombrePeremptions} lot${nombrePeremptions > 1 ? 's' : ''} sous surveillance`,
  ]
    .filter(Boolean)
    .join(', ');

  const classes = (actif: boolean) =>
    cn(
      'relative flex h-9 shrink-0 items-center rounded-lg text-corps font-medium transition-colors',
      'focus-visible:outline-white/70',
      replie ? 'justify-center' : 'gap-2.5 px-2.5',
      // Le fond de l'entrée active est la pastille glissante de la barre (voir AppLayout).
      actif ? 'text-white' : 'text-white/65 hover:bg-white/5 hover:text-white',
    );

  const contenu = (actif: boolean) => (
    <>
      <Icone className={cn('size-[18px] shrink-0', actif && 'text-action-clair')} aria-hidden="true" />
      {replie ? (
        signalements > 0 && (
          <span
            className={cn(
              'absolute top-1.5 right-2.5 size-2 rounded-full ring-2 ring-ink-800',
              nombreAlertes > 0 ? 'bg-rupture' : 'bg-faible',
            )}
            aria-hidden="true"
          />
        )
      ) : (
        <>
          <span className="flex-1 truncate">{libelle}</span>
          {estAlertes && nombreAlertes > 0 && (
            <span
              className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rupture px-1.5 text-meta font-semibold text-sur-couleur"
              aria-hidden="true"
            >
              {nombreAlertes}
            </span>
          )}
          {estAlertes && nombrePeremptions > 0 && (
            <span
              className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-faible px-1.5 text-meta font-semibold text-sur-couleur"
              aria-hidden="true"
            >
              {nombrePeremptions}
            </span>
          )}
        </>
      )}
    </>
  );

  const nomAccessible = description ? `${libelle} : ${description}` : replie ? libelle : undefined;
  const bulle = propsBulle(description ? `${libelle} · ${signalements}` : libelle, replie, onBulle);

  if (actifForce !== undefined) {
    return (
      <NavLink
        to={to}
        className={classes(actifForce)}
        aria-current={actifForce ? 'page' : undefined}
        aria-label={nomAccessible}
        {...bulle}
      >
        {contenu(actifForce)}
      </NavLink>
    );
  }

  return (
    <NavLink to={to} end={exact} className={({ isActive }) => classes(isActive)} aria-label={nomAccessible} {...bulle}>
      {({ isActive }) => contenu(isActive)}
    </NavLink>
  );
}

/** Teinte de chaque tuile du menu mobile, reprise des écrans eux-mêmes. */
const TEINTES_MENU_MOBILE: Record<string, string> = {
  '/statistiques': 'var(--color-accent)',
  '/alertes': 'var(--color-rupture)',
  '/produits': 'var(--color-action)',
  '/pertes': 'var(--color-rupture)',
  '/fournisseurs': 'var(--color-serie-4)',
  '/clients': 'var(--color-ok)',
  '/rapports': 'var(--color-steel-500)',
  '/emplacements': 'var(--color-action)',
  '/categories': 'var(--color-accent)',
  '/parametres': 'var(--color-steel-500)',
};

export function AppLayout() {
  const session = useSession();
  const modules = useModules();
  const [assistantOuvert, setAssistantOuvert] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [profilOuvert, setProfilOuvert] = useState(false);
  const admin = session?.utilisateur.role === 'ADMIN';
  // Hors ligne : les écrans principaux sont préchargés au démarrage, au
  // retour du réseau et à chaque « Synchroniser ».
  usePrechargementHorsLigne(admin, modules.lots, modules.rangement, modules.charge);
  // Base locale de l'appareil (ADR 0001) : tenue à jour en arrière-plan.
  useSynchronisationLocale(session?.entreprise.id);
  const prechargerMaintenant = useCallback(
    async () => {
      await Promise.all([
        prechargerEcrans({ admin, lots: modules.lots, rangement: modules.rangement }, true),
        synchroniserBaseLocale(),
      ]);
    },
    [admin, modules.lots, modules.rangement],
  );
  const { statut: statutSynchro, nombreEnAttente, file: fileSynchro, synchroniser } =
    useSynchronisation(prechargerMaintenant);
  const [plusOuvert, setPlusOuvert] = useState(false);

  const [recherche, setRecherche] = useState('');
  const [replie, setReplie] = useState(lireBarreRepliee);
  const [bulle, setBulle] = useState<Bulle | null>(null);
  const [menuProfilOuvert, setMenuProfilOuvert] = useState(false);
  const menuProfilRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const pastilleNavRef = useRef<HTMLSpanElement>(null);
  useIndicateurGlissant(navRef, pastilleNavRef, 'a[aria-current="page"]', `${location.pathname}|${replie}`, 'y');

  function basculerBarre() {
    setBulle(null);
    setReplie((actuel) => {
      enregistrerBarreRepliee(!actuel);
      return !actuel;
    });
  }

  // Menu du compte : se ferme au clic à l'extérieur et avec Échap.
  useEffect(() => {
    if (!menuProfilOuvert) return;
    const clicExterieur = (event: MouseEvent) => {
      if (!menuProfilRef.current?.contains(event.target as Node)) setMenuProfilOuvert(false);
    };
    const touche = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuProfilOuvert(false);
    };
    document.addEventListener('mousedown', clicExterieur);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('mousedown', clicExterieur);
      document.removeEventListener('keydown', touche);
    };
  }, [menuProfilOuvert]);

  // Notifications push : appareil réabonné après une reconnexion. Toucher
  // une notification (public/sw.js) ouvre sa page sans recharger l'application.
  useEffect(() => {
    void resynchroniserPush();
    if (!('serviceWorker' in navigator)) return;
    const message = (event: MessageEvent) => {
      const { type, chemin } = (event.data ?? {}) as { type?: string; chemin?: unknown };
      if (type === 'naviguer' && typeof chemin === 'string' && chemin.startsWith('/')) navigate(chemin);
    };
    navigator.serviceWorker.addEventListener('message', message);
    return () => navigator.serviceWorker.removeEventListener('message', message);
  }, [navigate]);

  // Menu mobile : Échap le ferme, comme le voile.
  useEffect(() => {
    if (!plusOuvert) return;
    const touche = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlusOuvert(false);
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [plusOuvert]);

  const ariane = filAriane(location.pathname);
  const sousChemin = (chemin: string) => location.pathname === chemin || location.pathname.startsWith(`${chemin}/`);

  // Compteur d'alertes actives — partage la clé de cache avec la page
  // Alertes, donc tout mouvement de stock qui l'invalide met aussi la
  // pastille à jour automatiquement.
  const alertesActives = useQuery({
    queryKey: ['alertes', 'ACTIVE'],
    queryFn: async () => (await api.get<{ type: 'STOCK_FAIBLE' | 'RUPTURE' }[]>('/alertes?statut=ACTIVE')).data,
  });
  const nombreAlertes = alertesActives.data?.length ?? 0;
  const nombreRuptures = alertesActives.data?.filter((a) => a.type === 'RUPTURE').length ?? 0;
  const nombreFaibles = nombreAlertes - nombreRuptures;
  // Même clé que l'écran Péremptions : une sortie de lot y met la pastille à jour.
  const peremptions = useQuery({
    queryKey: ['peremptions', 'resume'],
    queryFn: async () => (await api.get<{ sousSurveillance: number }>('/peremptions')).data,
    staleTime: 5 * 60_000,
    // Module Lots coupé : ni écran ni pastille (le serveur refuserait).
    enabled: modules.lots,
  });
  const nombrePeremptions = modules.lots ? (peremptions.data?.sousSurveillance ?? 0) : 0;

  // Sections réunies : une entrée de menu, des onglets en haut de chaque page.
  const groupes: { libelle: string; onglets: OngletSection[] }[] = [
    ...(modules.valorisation || modules.rotation
      ? [
          {
            libelle: 'Statistiques',
            onglets: [
              { to: '/statistiques', libelle: 'Vue d’ensemble' },
              ...(modules.valorisation ? [{ to: '/valorisation', libelle: 'Valorisation' }] : []),
              ...(modules.rotation ? [{ to: '/rotation', libelle: 'Rotation' }] : []),
            ],
          },
        ]
      : []),
    {
      libelle: 'Alertes',
      onglets: [
        { to: '/alertes', libelle: 'Stock', compteur: nombreAlertes },
        ...(modules.lots ? [{ to: '/peremptions', libelle: 'Péremptions', compteur: nombrePeremptions }] : []),
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
        ...(modules.reapprovisionnement ? [{ to: '/reapprovisionnement', libelle: 'Réapprovisionnement' }] : []),
      ],
    },
  ];
  const ongletsSection = groupes.find((g) => g.onglets.some((o) => o.to === location.pathname));

  async function seDeconnecter() {
    try {
      // Le cookie du refresh token part seul : le serveur le révoque et l'efface.
      if (getSession()) {
        // Plus de notifications sur cet appareil une fois déconnecté.
        await desactiverPush();
        await api.post('/auth/logout');
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

  const sectionsMenuMobile = sectionsNav
    .map((section) => ({
      titre: section.titre,
      // Les pages d'usage courant d'abord, la configuration (Admin) ensuite.
      liens: section.liens
        .filter(
          (lien) =>
            !navMobile.some((m) => m.to === lien.to) &&
            (!lien.admin || session?.utilisateur.role === 'ADMIN') &&
            (lien.module !== 'rapports' || modules.rapports),
        )
        .sort((a, b) => Number(Boolean(a.admin)) - Number(Boolean(b.admin))),
    }))
    .filter((section) => section.liens.length > 0);
  // Entrée échelonnée des tuiles, dans l'ordre de lecture.
  let indexTuile = 0;

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
      {/* Barre latérale desktop : panneau flottant, réductible à ses icônes. */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 py-3 pl-3 md:flex">
        <div
          className={cn(
            'barre-laterale flex flex-col rounded-xl bg-ink-800 shadow-[0_18px_40px_-24px_rgba(16,24,40,0.55)]',
            replie ? 'w-[68px]' : 'w-[248px]',
          )}
        >
          <div className={cn('flex gap-2 pt-4 pb-3', replie ? 'flex-col items-center px-2' : 'items-center px-3.5')}>
            <Link
              to="/"
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 text-white focus-visible:outline-white/70"
              aria-label={replie ? 'NimbaFlow : tableau de bord' : undefined}
            >
              <Logo taille={30} />
              {!replie && <span className="truncate text-panneau">NimbaFlow</span>}
            </Link>
            <button
              type="button"
              onClick={basculerBarre}
              aria-label={replie ? 'Déployer le menu' : 'Réduire le menu'}
              aria-expanded={!replie}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-white/70"
              {...propsBulle('Déployer le menu', replie, setBulle)}
            >
              {replie ? (
                <PanelLeftOpen className="size-[18px]" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="size-[18px]" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className={cn('flex flex-col gap-2 pb-3', replie ? 'items-center px-2' : 'px-3')}>
            <div
              className={cn(
                'flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.04]',
                replie ? 'p-1' : 'px-2.5 py-2',
              )}
              tabIndex={replie ? 0 : undefined}
              aria-label={replie ? `Entreprise : ${session?.entreprise.nom ?? ''}` : undefined}
              {...propsBulle(session?.entreprise.nom ?? '', replie, setBulle)}
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-meta font-bold text-white"
                aria-hidden="true"
              >
                {initialesEntreprise}
              </span>
              {!replie && (
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-corps font-semibold text-white">{session?.entreprise.nom}</span>
                  <span className="block truncate text-meta text-white/60">Espace de gestion</span>
                </span>
              )}
            </div>
            {/* Action principale : la vente au comptoir, à un clic de partout. */}
            <Link
              to="/ventes/nouvelle"
              aria-label={replie ? 'Nouvelle vente' : undefined}
              className={cn(
                'flex h-9 items-center justify-center gap-2 rounded-lg bg-action text-corps font-semibold text-sur-couleur transition-colors hover:bg-action-dark focus-visible:outline-white/70',
                replie ? 'w-9' : 'w-full',
              )}
              {...propsBulle('Nouvelle vente', replie, setBulle)}
            >
              <Plus className="size-[18px]" aria-hidden="true" />
              {!replie && 'Nouvelle vente'}
            </Link>
          </div>

          {/* Groupes séparés par un filet : les icônes suffisent à les distinguer, sans intitulés. */}
          <nav
            ref={navRef}
            className={cn(
              'relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto pb-3 [scrollbar-color:rgb(255_255_255/0.2)_transparent] [scrollbar-width:thin]',
              replie ? 'px-2' : 'px-3',
            )}
            aria-label="Navigation principale"
            onScroll={() => setBulle(null)}
          >
            {/* Pastille de l'entrée active : glisse d'une entrée à l'autre. */}
            <span
              ref={pastilleNavRef}
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute top-0 rounded-lg bg-white/10 shadow-[inset_2px_0_0_var(--color-action-clair)] data-[pret]:transition-[transform,height] data-[pret]:duration-300 data-[pret]:ease-sortie motion-reduce:transition-none',
                replie ? 'inset-x-2' : 'inset-x-3',
              )}
            />
            {sectionsNav.map((section) => {
              const liens = section.liens.filter(
                (lien) =>
                  (!lien.admin || session?.utilisateur.role === 'ADMIN') &&
                  (lien.module !== 'rapports' || modules.rapports),
              );
              if (liens.length === 0) return null;
              return (
                <div
                  key={section.titre}
                  role="group"
                  aria-label={section.titre}
                  className="flex flex-col gap-0.5 border-t border-white/[0.07] py-2.5 first:border-t-0 first:pt-0"
                >
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
                      replie={replie}
                      onBulle={setBulle}
                    />
                  ))}
                </div>
              );
            })}
          </nav>

          <div ref={menuProfilRef} className="relative border-t border-white/[0.08] p-2">
            <button
              type="button"
              onClick={() => {
                setBulle(null);
                setMenuProfilOuvert((ouvert) => !ouvert);
              }}
              aria-expanded={menuProfilOuvert}
              aria-label={replie ? `Compte de ${session?.utilisateur.nom ?? ''}` : undefined}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-white/5 focus-visible:outline-white/70',
                replie && 'justify-center',
                menuProfilOuvert && 'bg-white/5',
              )}
              {...propsBulle(session?.utilisateur.nom ?? '', replie && !menuProfilOuvert, setBulle)}
            >
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-action text-meta font-semibold text-sur-couleur">
                {session?.utilisateur.photoUrl ? (
                  <img src={session.utilisateur.photoUrl} alt="" className="size-full object-cover" />
                ) : (
                  initiales
                )}
              </span>
              {!replie && (
                <>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-corps font-semibold text-white">
                      {session?.utilisateur.nom}
                    </span>
                    <span className="block truncate text-meta text-white/60">
                      {session?.utilisateur.role === 'ADMIN' ? 'Administrateur' : 'Gestionnaire'}
                    </span>
                  </span>
                  <EllipsisVertical className="size-[18px] shrink-0 text-white/60" aria-hidden="true" />
                </>
              )}
            </button>
            {menuProfilOuvert && (
              <div
                role="group"
                aria-label="Compte"
                className={cn(
                  'absolute z-50 w-52 rounded-lg border border-rule bg-surface p-1 shadow-pop',
                  replie ? 'bottom-2 left-full ml-3' : 'right-2 bottom-full left-2 mb-2 w-auto',
                )}
              >
                <BoutonInstaller variante="menu" onAction={() => setMenuProfilOuvert(false)} />
                <button
                  type="button"
                  onClick={() => {
                    setMenuProfilOuvert(false);
                    setProfilOuvert(true);
                  }}
                  className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-corps font-medium text-ink-900 hover:bg-survol"
                >
                  <UserRound className="size-4 text-steel-500" aria-hidden="true" />
                  Mon profil
                </button>
                <button
                  type="button"
                  onClick={seDeconnecter}
                  className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-corps font-medium text-rupture hover:bg-survol"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {replie && bulle && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 -translate-y-1/2 rounded-md bg-action px-2.5 py-1.5 text-meta font-semibold whitespace-nowrap text-sur-couleur shadow-pop"
          style={{ top: bulle.haut, left: bulle.gauche }}
        >
          <span className="absolute top-1/2 -left-1 size-2 -translate-y-1/2 rotate-45 bg-action" aria-hidden="true" />
          {bulle.texte}
        </div>
      )}

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
            <IndicateurSynchro
              variante="bureau"
              className="hidden md:inline-flex"
              statut={statutSynchro}
              file={fileSynchro}
              libelleReseau={libelleReseau}
              synchroniser={synchroniser}
            />
            {modules.assistant && (
              <button
                type="button"
                onClick={() => setAssistantOuvert(true)}
                aria-label="Ouvrir l’assistant"
                title="Assistant"
                className="inline-flex size-9 items-center justify-center rounded-md text-steel-700 transition-colors hover:bg-survol hover:text-ink-900"
              >
                <Bot className="size-[18px]" aria-hidden="true" />
              </button>
            )}
            <a
              href={`mailto:${ADRESSE_AIDE}`}
              aria-label={`Aide : écrire à ${ADRESSE_AIDE}`}
              title="Aide"
              className="hidden size-9 items-center justify-center rounded-md text-steel-700 transition-colors hover:bg-survol hover:text-ink-900 md:inline-flex"
            >
              <CircleHelp className="size-[18px]" aria-hidden="true" />
            </a>
            <ClocheNotifications />
            {/* Mobile : la pastille n'apparaît que s'il y a quelque chose à signaler. */}
            {(statutSynchro !== 'en-ligne' || nombreEnAttente > 0) && (
              <IndicateurSynchro
                variante="mobile"
                className="md:hidden"
                statut={statutSynchro}
                file={fileSynchro}
                libelleReseau={libelleReseau}
                synchroniser={synchroniser}
              />
            )}
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
          <div
            className="menu-mobile-voile absolute inset-0 bg-voile/50 backdrop-blur-[2px]"
            onClick={() => setPlusOuvert(false)}
            aria-hidden="true"
          />
          {/* Le menu remonte du bas de l'écran, à portée de pouce. */}
          <div className="menu-mobile-panneau absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col bg-surface">
            <div className="mx-auto mt-2 mb-1 h-[5px] w-10 rounded-full bg-rule-strong" aria-hidden="true" />
            <div className="flex items-center gap-3 px-4 pt-2 pb-3.5">
              <button
                type="button"
                onClick={() => {
                  setPlusOuvert(false);
                  setProfilOuvert(true);
                }}
                aria-label="Mon profil"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
              >
                <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-action font-display text-corps font-semibold text-sur-couleur">
                  {session?.utilisateur.photoUrl ? (
                    <img src={session.utilisateur.photoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    initiales
                  )}
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[15px] font-semibold text-ink-900">{session?.utilisateur.nom}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-meta text-steel-400">
                    <span className="truncate">
                      {session?.utilisateur.role === 'ADMIN' ? 'Administrateur' : 'Gestionnaire'} · {session?.entreprise.nom}
                    </span>
                    <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPlusOuvert(false)}
                aria-label="Fermer le menu"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-paper text-steel-500 hover:bg-survol"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="overflow-y-auto px-4 pb-2.5">
              <Link
                to="/ventes/nouvelle"
                onClick={() => setPlusOuvert(false)}
                className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-action text-[15px] font-semibold text-sur-couleur shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition-colors hover:bg-action-dark"
              >
                <Plus className="size-5" aria-hidden="true" />
                Nouvelle vente
              </Link>
              {sectionsMenuMobile.map((section) => (
                <div key={section.titre} role="group" aria-labelledby={`menu-${section.titre}`}>
                  <h3
                    id={`menu-${section.titre}`}
                    className="mx-0.5 mt-4 mb-2 text-[11.5px] font-bold tracking-[0.07em] text-steel-400 uppercase"
                  >
                    {section.titre}
                  </h3>
                  <div className="menu-mobile-tuiles">
                    {section.liens.map((lien) => {
                      const actif = sousChemin(lien.to) || (lien.aussi?.some(sousChemin) ?? false);
                      const estAlertes = lien.to === '/alertes';
                      return (
                        <Link
                          key={lien.to}
                          to={lien.to}
                          onClick={() => setPlusOuvert(false)}
                          aria-current={actif ? 'page' : undefined}
                          className="menu-mobile-tuile"
                          style={{ '--teinte': TEINTES_MENU_MOBILE[lien.to], animationDelay: `${indexTuile++ * 25}ms` } as React.CSSProperties}
                        >
                          <span className="menu-mobile-pastille" aria-hidden="true">
                            <lien.Icone className="size-5" />
                          </span>
                          {lien.libelle}
                          {estAlertes && (nombreRuptures > 0 || nombreFaibles > 0) && (
                            <>
                              <span className="menu-mobile-badges" aria-hidden="true">
                                {nombreRuptures > 0 && <span className="bg-rupture">{nombreRuptures}</span>}
                                {nombreFaibles > 0 && <span className="bg-faible">{nombreFaibles}</span>}
                              </span>
                              <span className="sr-only">
                                {[
                                  nombreRuptures > 0 && `${nombreRuptures} en rupture`,
                                  nombreFaibles > 0 && `${nombreFaibles} sous le seuil`,
                                ]
                                  .filter(Boolean)
                                  .join(', ')}
                              </span>
                            </>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
              <BoutonInstaller variante="carte" />
            </div>

            <div className="flex items-center justify-between gap-2.5 border-t border-rule px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
              <span className="inline-flex min-w-0 items-center gap-2 text-meta text-steel-500">
                <span
                  className={cn(
                    'inline-flex size-2 shrink-0 rounded-full',
                    statutSynchro === 'hors-ligne'
                      ? 'bg-rupture'
                      : statutSynchro === 'synchronisation'
                        ? 'bg-faible'
                        : 'bg-ok',
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">
                  {libelleReseau}
                  {nombreEnAttente > 0 && ` · ${nombreEnAttente} en attente`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void synchroniser()}
                disabled={statutSynchro !== 'en-ligne'}
                aria-label="Synchroniser maintenant"
                title="Synchroniser maintenant"
                className="ml-auto inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-rule-strong bg-surface text-action hover:bg-survol disabled:text-steel-400"
              >
                <RefreshCw
                  className={cn('size-4', statutSynchro === 'synchronisation' && 'animate-spin motion-reduce:animate-none')}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                onClick={seDeconnecter}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-rule-strong bg-surface px-3 text-[13px] font-semibold text-rupture hover:bg-survol"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      <ProfilModal ouvert={profilOuvert} onFermer={() => setProfilOuvert(false)} onDeconnecter={seDeconnecter} />
      {modules.assistant && <AssistantPanel ouvert={assistantOuvert} onFermer={() => setAssistantOuvert(false)} />}
    </div>
  );
}
