import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Package,
  Settings,
  Tag,
  Truck,
  Warehouse,
  Wifi,
} from 'lucide-react';
import { api } from '@/lib/api';
import { clearSession, getSession } from '@/lib/session';
import { useSession } from '@/lib/useSession';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Logo } from '@/components/patterns/Logo';
import { ProfilModal } from '@/features/profil/ProfilModal';
import { useSynchronisation } from '@/lib/useSynchronisation';

const sectionPilotage = [
  { to: '/', libelle: 'Tableau de bord', Icone: LayoutDashboard, exact: true },
  { to: '/produits', libelle: 'Produits', Icone: Package },
  { to: '/stock', libelle: 'Stock & mouvements', Icone: Warehouse },
  { to: '/alertes', libelle: 'Alertes', Icone: Bell },
];

// Fournisseurs reste accessible à tous (comme Produits) ; Catégories &
// marques et Paramètres sont ajoutés séparément ci-dessous, réservés à
// l'Admin — /parametres est entièrement protégé côté routage, un
// Gestionnaire qui cliquerait dessus serait silencieusement renvoyé à
// l'accueil.
const sectionReferentiel = [
  { to: '/fournisseurs', libelle: 'Fournisseurs', Icone: Truck },
  { to: '/commandes', libelle: 'Commandes fournisseur', Icone: ClipboardList },
];

// Les 4 destinations les plus fréquentes uniquement : la barre mobile
// n'a la place que pour ça sans devenir illisible. Fournisseurs,
// Catégories/Marques et Paramètres restent accessibles via « Plus ».
const navMobile = [
  { to: '/', libelle: 'Accueil', Icone: LayoutDashboard, exact: true },
  { to: '/produits', libelle: 'Produits', Icone: Package },
  { to: '/stock', libelle: 'Mouvements', Icone: Warehouse },
  { to: '/alertes', libelle: 'Alertes', Icone: Bell },
];

function LienNav({
  to,
  libelle,
  Icone,
  exact,
  nombreAlertes,
  onNaviguer,
  actifForce,
}: {
  to: string;
  libelle: string;
  Icone: typeof LayoutDashboard;
  exact?: boolean;
  nombreAlertes: number;
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
      'flex items-center gap-3 rounded-(--radius-button) px-3 py-2.5 text-sm font-medium transition-colors',
      actif ? 'bg-primary text-white' : 'text-navy-text hover:bg-white/5 hover:text-white',
    );

  const contenu = (
    <>
      <Icone className="size-[18px] shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate">{libelle}</span>
      {estAlertes && nombreAlertes > 0 && (
        <span
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-error px-1.5 py-0.5 text-xs font-semibold text-white"
          aria-label={`${nombreAlertes} alerte${nombreAlertes > 1 ? 's' : ''} active${nombreAlertes > 1 ? 's' : ''}`}
        >
          {nombreAlertes}
        </span>
      )}
    </>
  );

  if (actifForce !== undefined) {
    return (
      <NavLink to={to} onClick={onNaviguer} className={classes(actifForce)}>
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

export function AppLayout() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [profilOuvert, setProfilOuvert] = useState(false);
  const { statut: statutSynchro, nombreEnAttente } = useSynchronisation();
  const [plusOuvert, setPlusOuvert] = useState(false);

  const surParametres = location.pathname === '/parametres';
  const ongletCategoriesActif = surParametres && new URLSearchParams(location.search).get('onglet') === 'categories';

  // Compteur d'alertes actives — partage la clé de cache avec la page
  // Alertes, donc tout mouvement de stock qui l'invalide met aussi la
  // pastille à jour automatiquement.
  const alertesActives = useQuery({
    queryKey: ['alertes', 'ACTIVE'],
    queryFn: async () => (await api.get<unknown[]>('/alertes?statut=ACTIVE')).data,
  });
  const nombreAlertes = alertesActives.data?.length ?? 0;

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

  return (
    <div className="flex min-h-full">
      {/* Sidebar desktop — bleu nuit, conforme au nouveau design */}
      <aside className="hidden w-64 shrink-0 flex-col bg-navy md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Logo taille={36} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-semibold text-white">StockFlow</p>
            <p className="truncate text-xs text-navy-text">{session?.entreprise.nom}</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pt-2" aria-label="Navigation principale">
          <div className="flex flex-col gap-1">
            <span className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-navy-text/70 uppercase">
              Pilotage
            </span>
            {sectionPilotage.map((lien) => (
              <LienNav key={lien.to} {...lien} nombreAlertes={nombreAlertes} />
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <span className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-navy-text/70 uppercase">
              Référentiel
            </span>
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
          </div>
        </nav>

        <div className="p-3">
          <div
            className={cn(
              'flex items-center gap-2 rounded-(--radius-button) px-3 py-2.5 text-xs',
              statutSynchro === 'hors-ligne' ? 'bg-error/20 text-white' : 'bg-navy-light text-navy-text',
            )}
          >
            <span
              className={cn(
                'inline-flex size-2 shrink-0 rounded-full',
                statutSynchro === 'hors-ligne'
                  ? 'bg-error'
                  : statutSynchro === 'synchronisation'
                    ? 'animate-pulse bg-warning'
                    : 'bg-success',
              )}
              aria-hidden="true"
            />
            <Wifi className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {statutSynchro === 'hors-ligne'
                ? nombreEnAttente > 0
                  ? `Hors ligne · ${nombreEnAttente} en attente`
                  : 'Hors ligne'
                : statutSynchro === 'synchronisation'
                  ? 'Synchronisation…'
                  : 'En ligne'}
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-border-subtle bg-surface px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <Logo taille={28} />
            <span className="truncate text-sm font-medium text-text-primary">{session?.entreprise.nom}</span>
          </div>
          <span className="hidden truncate text-sm font-medium text-text-secondary md:block">
            {session?.entreprise.nom}
          </span>

          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setProfilOuvert(true)}
              className="hidden items-center gap-2 rounded-(--radius-button) px-1 py-1 sm:flex hover:bg-background"
            >
              <span className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {session?.utilisateur.photoUrl ? (
                  <img src={session.utilisateur.photoUrl} alt="" className="size-full object-cover" />
                ) : (
                  initiales
                )}
              </span>
              <div className="flex flex-col leading-tight text-left">
                <span className="text-sm text-text-primary">{session?.utilisateur.nom}</span>
                <Badge variant="neutral">
                  {session?.utilisateur.role === 'ADMIN' ? 'Administrateur' : 'Gestionnaire'}
                </Badge>
              </div>
            </button>

            <button
              type="button"
              onClick={seDeconnecter}
              className="flex items-center gap-2 rounded-(--radius-button) px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-background hover:text-text-primary"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 pb-20 md:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Barre de navigation mobile — remplace l'ancien menu plein écran */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border-subtle bg-surface md:hidden"
        aria-label="Navigation principale"
      >
        {navMobile.map(({ to, libelle, Icone, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              cn(
                'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                isActive ? 'text-primary' : 'text-text-secondary',
              )
            }
          >
            <Icone className="size-5" aria-hidden="true" />
            {libelle}
            {to === '/alertes' && nombreAlertes > 0 && (
              <span
                className="absolute top-1 right-[calc(50%-18px)] inline-flex size-2 rounded-full bg-error"
                aria-hidden="true"
              />
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setPlusOuvert(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-text-secondary"
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
          Plus
        </button>
      </nav>

      {plusOuvert && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-secondary/40" onClick={() => setPlusOuvert(false)} aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-(--radius-modal) bg-surface p-3 pb-6">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-subtle" />
            <NavLink
              to="/fournisseurs"
              onClick={() => setPlusOuvert(false)}
              className="flex items-center gap-3 rounded-(--radius-button) px-3 py-3 text-sm font-medium text-text-primary hover:bg-background"
            >
              <Truck className="size-5 text-text-secondary" aria-hidden="true" />
              Fournisseurs
            </NavLink>
            <NavLink
              to="/commandes"
              onClick={() => setPlusOuvert(false)}
              className="flex items-center gap-3 rounded-(--radius-button) px-3 py-3 text-sm font-medium text-text-primary hover:bg-background"
            >
              <ClipboardList className="size-5 text-text-secondary" aria-hidden="true" />
              Commandes fournisseur
            </NavLink>
            {session?.utilisateur.role === 'ADMIN' && (
              <>
                <NavLink
                  to="/parametres?onglet=categories"
                  onClick={() => setPlusOuvert(false)}
                  className="flex items-center gap-3 rounded-(--radius-button) px-3 py-3 text-sm font-medium text-text-primary hover:bg-background"
                >
                  <Tag className="size-5 text-text-secondary" aria-hidden="true" />
                  Catégories & marques
                </NavLink>
                <NavLink
                  to="/parametres"
                  onClick={() => setPlusOuvert(false)}
                  className="flex items-center gap-3 rounded-(--radius-button) px-3 py-3 text-sm font-medium text-text-primary hover:bg-background"
                >
                  <Settings className="size-5 text-text-secondary" aria-hidden="true" />
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
              className="flex w-full items-center gap-3 rounded-(--radius-button) px-3 py-3 text-left text-sm font-medium text-text-primary hover:bg-background"
            >
              <Boxes className="size-5 text-text-secondary" aria-hidden="true" />
              Mon profil
            </button>
          </div>
        </div>
      )}

      <ProfilModal ouvert={profilOuvert} onFermer={() => setProfilOuvert(false)} />
    </div>
  );
}
