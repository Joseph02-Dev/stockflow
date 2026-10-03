import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  HandCoins,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Package,
  Receipt,
  Settings,
  Tag,
  Truck,
  UserRound,
  Users,
  Warehouse,
} from 'lucide-react';
import { api } from '@/lib/api';
import { clearSession, getSession } from '@/lib/session';
import { useSession } from '@/lib/useSession';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/patterns/Logo';
import { ProfilModal } from '@/features/profil/ProfilModal';
import { useSynchronisation } from '@/lib/useSynchronisation';
import { BarreProgression } from '@/components/patterns/BarreProgression';

const sectionPilotage = [
  { to: '/', libelle: 'Tableau de bord', Icone: LayoutDashboard, exact: true },
  { to: '/ventes', libelle: 'Ventes', Icone: Receipt },
  { to: '/creances', libelle: 'Créances', Icone: HandCoins },
  { to: '/alertes', libelle: 'Alertes', Icone: Bell },
  { to: '/peremptions', libelle: 'Péremptions', Icone: CalendarClock },
  { to: '/stock', libelle: 'Stock & mouvements', Icone: Warehouse },
  { to: '/commandes', libelle: 'Commandes fournisseur', Icone: ClipboardList },
];

// Fournisseurs reste accessible à tous (comme Produits) ; Catégories &
// marques et Paramètres sont ajoutés séparément ci-dessous, réservés à
// l'Admin — /parametres est entièrement protégé côté routage, un
// Gestionnaire qui cliquerait dessus serait silencieusement renvoyé à
// l'accueil.
const sectionReferentiel = [
  { to: '/produits', libelle: 'Produits', Icone: Package },
  { to: '/fournisseurs', libelle: 'Fournisseurs', Icone: Truck },
  { to: '/clients', libelle: 'Clients', Icone: Users },
];

// Les 4 destinations les plus fréquentes uniquement : la barre mobile
// n'a la place que pour ça sans devenir illisible. La vente au comptoir
// est le premier usage mobile : elle prend la place de Produits, qui
// rejoint Fournisseurs, Clients, Catégories/Marques et Paramètres dans « Plus ».
const navMobile = [
  { to: '/', libelle: 'Accueil', Icone: LayoutDashboard, exact: true },
  { to: '/ventes', libelle: 'Ventes', Icone: Receipt },
  { to: '/stock', libelle: 'Mouvements', Icone: Warehouse },
  { to: '/alertes', libelle: 'Alertes', Icone: Bell },
];

/**
 * Fil d'Ariane : libellé de la section courante, et le niveau de détail
 * éventuel (création, fiche). Dérivé du chemin pour ne pas obliger
 * chaque page à le déclarer.
 */
function filAriane(chemin: string, recherche: string): { libelle: string; to?: string }[] {
  const sections: Record<string, string> = {
    produits: 'Produits',
    stock: 'Stock & mouvements',
    inventaires: 'Stock & mouvements',
    alertes: 'Alertes',
    commandes: 'Commandes fournisseur',
    fournisseurs: 'Fournisseurs',
    clients: 'Clients',
    ventes: 'Ventes',
    creances: 'Créances',
    peremptions: 'Péremptions',
    parametres: 'Paramètres',
  };
  const [racine, detail] = chemin.split('/').filter(Boolean);
  if (!racine) return [{ libelle: 'Tableau de bord' }];
  if (racine === 'parametres' && new URLSearchParams(recherche).get('onglet') === 'categories') {
    return [{ libelle: 'Catégories & marques' }];
  }
  const section = sections[racine] ?? 'StockFlow';
  if (!detail) return [{ libelle: section }];

  const parent = racine === 'inventaires' ? '/stock' : `/${racine}`;
  const libelleDetail =
    detail === 'nouveau' || detail === 'nouvelle'
      ? racine === 'commandes'
        ? 'Nouvelle commande'
        : racine === 'ventes'
          ? 'Nouvelle vente'
          : 'Nouveau produit'
      : (
          {
            inventaires: 'Inventaire',
            commandes: 'Commande',
            fournisseurs: 'Fournisseur',
            ventes: 'Vente',
            produits: 'Fiche produit',
          } as Record<string, string>
        )[racine] ?? 'Fiche';
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
      'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-corps font-medium transition-colors',
      'focus-visible:outline-white/70',
      actif ? 'bg-action text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
    );

  const contenu = (
    <>
      <Icone className="size-[17px] shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate">{libelle}</span>
      {estAlertes && nombreAlertes > 0 && (
        <span
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rupture px-1.5 text-meta font-semibold text-white"
          aria-label={`${nombreAlertes} alerte${nombreAlertes > 1 ? 's' : ''} active${nombreAlertes > 1 ? 's' : ''}`}
        >
          {nombreAlertes}
        </span>
      )}
      {to === '/peremptions' && nombrePeremptions > 0 && (
        <span
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-faible px-1.5 text-meta font-semibold text-white"
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
  'flex h-12 items-center gap-3 rounded-md px-3 text-corps font-medium text-ink-900 hover:bg-paper';

export function AppLayout() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [profilOuvert, setProfilOuvert] = useState(false);
  const { statut: statutSynchro, nombreEnAttente } = useSynchronisation();
  const [plusOuvert, setPlusOuvert] = useState(false);

  const surParametres = location.pathname === '/parametres';
  const ongletCategoriesActif = surParametres && new URLSearchParams(location.search).get('onglet') === 'categories';
  const ariane = filAriane(location.pathname, location.search);

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
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col bg-ink-800 md:flex">
        <div className="flex h-[60px] items-center gap-2.5 border-b border-white/[0.06] px-4">
          <Logo taille={30} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-panneau text-white">StockFlow</p>
            <p className="truncate text-meta text-steel-400">{session?.entreprise.nom}</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pt-5" aria-label="Navigation principale">
          <SectionNav titre="Pilotage">
            {sectionPilotage.map((lien) => (
              <LienNav key={lien.to} {...lien} nombreAlertes={nombreAlertes} nombrePeremptions={nombrePeremptions} />
            ))}
          </SectionNav>

          <SectionNav titre="Référentiel">
            {sectionReferentiel.map((lien) => (
              <LienNav key={lien.to} {...lien} nombreAlertes={nombreAlertes} />
            ))}
            {session?.utilisateur.role === 'ADMIN' && (
              <>
                <LienNav
                  to="/parametres?onglet=categories"
                  libelle="Catégories & marques"
                  Icone={Tag}
                  nombreAlertes={nombreAlertes}
                  actifForce={ongletCategoriesActif}
                />
                <LienNav
                  to="/parametres"
                  libelle="Paramètres"
                  Icone={Settings}
                  nombreAlertes={nombreAlertes}
                  actifForce={surParametres && !ongletCategoriesActif}
                />
              </>
            )}
          </SectionNav>
        </nav>

        <div className="p-3">
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2.5 text-meta',
              statutSynchro === 'hors-ligne' ? 'bg-rupture/25 text-white' : 'bg-ink-600 text-steel-400',
            )}
            role="status"
          >
            <span
              className={cn(
                'inline-flex size-2 shrink-0 rounded-full',
                statutSynchro === 'hors-ligne'
                  ? 'bg-rupture shadow-[0_0_0_3px_rgba(195,43,30,0.3)]'
                  : statutSynchro === 'synchronisation'
                    ? 'animate-pulse bg-faible shadow-[0_0_0_3px_rgba(180,105,14,0.3)]'
                    : 'bg-reseau shadow-[0_0_0_3px_rgba(44,196,138,0.22)]',
              )}
              aria-hidden="true"
            />
            <span className="truncate">{libelleReseau}</span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-rule bg-surface px-4 md:px-7">
          <div className="flex min-w-0 items-center gap-2.5 md:hidden">
            <Logo taille={26} />
            <span className="truncate text-panneau text-ink-900">{ariane[ariane.length - 1].libelle}</span>
          </div>

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

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setProfilOuvert(true)}
              className="hidden items-center gap-2.5 rounded-md py-1 pr-2 pl-1 hover:bg-paper sm:flex"
            >
              <span className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-meta font-semibold text-white">
                {session?.utilisateur.photoUrl ? (
                  <img src={session.utilisateur.photoUrl} alt="" className="size-full object-cover" />
                ) : (
                  initiales
                )}
              </span>
              <span className="flex flex-col text-left">
                <span className="text-corps font-medium text-ink-900">{session?.utilisateur.nom}</span>
                <span className="text-meta text-steel-500">
                  {session?.utilisateur.role === 'ADMIN' ? 'Administrateur' : 'Gestionnaire'}
                </span>
              </span>
            </button>

            <span className="mx-1 hidden h-6 w-px bg-rule sm:block" aria-hidden="true" />

            <button
              type="button"
              onClick={seDeconnecter}
              className="flex h-9 items-center gap-2 rounded-md px-2.5 text-corps text-steel-500 transition-colors hover:bg-paper hover:text-ink-900"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden lg:inline">Déconnexion</span>
              <span className="sr-only lg:hidden">Déconnexion</span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pt-5 pb-24 md:px-7 md:pt-7 md:pb-10">
          {/* Clé = route : chaque changement d'écran rejoue l'entrée échelonnée des blocs. */}
          <div key={location.pathname} className="entree-page mx-auto w-full max-w-[1280px]">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Barre de navigation mobile — remplace l'ancien menu plein écran */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Navigation principale"
      >
        {navMobile.map(({ to, libelle, Icone, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              cn(
                'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-meta font-medium',
                isActive ? 'text-action' : 'text-steel-500',
              )
            }
          >
            <Icone className="size-5" aria-hidden="true" />
            {libelle}
            {to === '/alertes' && nombreAlertes > 0 && (
              <span
                className="absolute top-1 right-[calc(50%-20px)] inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rupture px-1 text-[10px] leading-none font-semibold text-white"
                aria-label={`${nombreAlertes} alerte${nombreAlertes > 1 ? 's' : ''} active${nombreAlertes > 1 ? 's' : ''}`}
              >
                {nombreAlertes}
              </span>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setPlusOuvert(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-meta font-medium text-steel-500"
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
          Plus
        </button>
      </nav>

      {plusOuvert && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setPlusOuvert(false)} aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-xl bg-surface p-3 pb-6 shadow-pop">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-rule-strong" />
            <NavLink to="/creances" onClick={() => setPlusOuvert(false)} className={classesLienPlus}>
              <HandCoins className="size-5 text-steel-500" aria-hidden="true" />
              Créances
            </NavLink>
            <NavLink to="/peremptions" onClick={() => setPlusOuvert(false)} className={classesLienPlus}>
              <CalendarClock className="size-5 text-steel-500" aria-hidden="true" />
              <span className="flex-1">Péremptions</span>
              {nombrePeremptions > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-faible px-1.5 text-meta font-semibold text-white">
                  {nombrePeremptions}
                </span>
              )}
            </NavLink>
            <NavLink to="/produits" onClick={() => setPlusOuvert(false)} className={classesLienPlus}>
              <Package className="size-5 text-steel-500" aria-hidden="true" />
              Produits
            </NavLink>
            <NavLink to="/commandes" onClick={() => setPlusOuvert(false)} className={classesLienPlus}>
              <ClipboardList className="size-5 text-steel-500" aria-hidden="true" />
              Commandes fournisseur
            </NavLink>
            <NavLink to="/fournisseurs" onClick={() => setPlusOuvert(false)} className={classesLienPlus}>
              <Truck className="size-5 text-steel-500" aria-hidden="true" />
              Fournisseurs
            </NavLink>
            <NavLink to="/clients" onClick={() => setPlusOuvert(false)} className={classesLienPlus}>
              <Users className="size-5 text-steel-500" aria-hidden="true" />
              Clients
            </NavLink>
            {session?.utilisateur.role === 'ADMIN' && (
              <>
                <NavLink
                  to="/parametres?onglet=categories"
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
            <div className="mt-2 flex items-center gap-2 border-t border-rule px-3 pt-3 text-meta text-steel-500">
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
