import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Boxes,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  Truck,
  Warehouse,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { clearSession, getSession } from '@/lib/session';
import { useSession } from '@/lib/useSession';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { ProfilModal } from '@/features/profil/ProfilModal';

const liens = [
  { to: '/', libelle: 'Dashboard', Icone: LayoutDashboard, exact: true },
  { to: '/produits', libelle: 'Produits', Icone: Package },
  { to: '/stock', libelle: 'Stock & Mouvements', Icone: Warehouse },
  { to: '/fournisseurs', libelle: 'Fournisseurs', Icone: Truck },
  { to: '/alertes', libelle: 'Alertes', Icone: Bell },
];

/**
 * Liste de liens partagée entre la sidebar desktop et le menu mobile —
 * un seul endroit à faire évoluer si un onglet est ajouté ou retiré.
 */
function ListeNavigation({
  role,
  nombreAlertes,
  onNaviguer,
}: {
  role: 'ADMIN' | 'GESTIONNAIRE' | undefined;
  nombreAlertes: number;
  onNaviguer?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Navigation principale">
      {liens.map(({ to, libelle, Icone, exact }) => (
        <NavLink
          key={to}
          to={to}
          end={exact}
          onClick={onNaviguer}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-(--radius-button) px-3 py-2.5 text-sm font-medium transition-colors md:py-2',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-text-secondary hover:bg-background hover:text-text-primary',
            )
          }
        >
          <Icone className="size-5" aria-hidden="true" />
          <span className="flex-1">{libelle}</span>
          {to === '/alertes' && nombreAlertes > 0 && (
            <span
              className="inline-flex min-w-5 items-center justify-center rounded-full bg-error px-1.5 py-0.5 text-xs font-semibold text-white"
              aria-label={`${nombreAlertes} alerte${nombreAlertes > 1 ? 's' : ''} active${nombreAlertes > 1 ? 's' : ''}`}
            >
              {nombreAlertes}
            </span>
          )}
        </NavLink>
      ))}

      {/* Paramètres : absent du menu pour un Gestionnaire — on ne montre
          pas ce que l'utilisateur ne peut pas faire. */}
      {role === 'ADMIN' && (
        <NavLink
          to="/parametres"
          onClick={onNaviguer}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-(--radius-button) px-3 py-2.5 text-sm font-medium transition-colors md:py-2',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-text-secondary hover:bg-background hover:text-text-primary',
            )
          }
        >
          <Settings className="size-5" aria-hidden="true" />
          Paramètres
        </NavLink>
      )}
    </nav>
  );
}

/**
 * Menu plein écran pour mobile (sous 768px), où la sidebar est masquée.
 * Même comportement que les autres panneaux du Design System : fermeture
 * par Échap, verrouillage du scroll, focus déplacé à l'ouverture.
 */
function MenuMobile({
  ouvert,
  onFermer,
  role,
  nombreAlertes,
  nomEntreprise,
}: {
  ouvert: boolean;
  onFermer: () => void;
  role: 'ADMIN' | 'GESTIONNAIRE' | undefined;
  nombreAlertes: number;
  nomEntreprise: string | undefined;
}) {
  const conteneurRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;

    function surTouche(event: KeyboardEvent) {
      if (event.key === 'Escape') onFermer();
    }
    document.addEventListener('keydown', surTouche);

    const overflowInitial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    conteneurRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', surTouche);
      document.body.style.overflow = overflowInitial;
    };
  }, [ouvert, onFermer]);

  if (!ouvert) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-secondary/40" onClick={onFermer} aria-hidden="true" />

      <div
        ref={conteneurRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-lg"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <div className="flex items-center gap-2">
            <Boxes className="size-6 text-primary" aria-hidden="true" />
            <span className="font-semibold text-secondary">StockFlow</span>
          </div>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer le menu"
            className="rounded-(--radius-button) p-1 text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {nomEntreprise && (
          <p className="truncate px-4 pb-2 text-xs text-text-secondary">{nomEntreprise}</p>
        )}

        <ListeNavigation role={role} nombreAlertes={nombreAlertes} onNaviguer={onFermer} />
      </div>
    </div>
  );
}

export function AppLayout() {
  const session = useSession();
  const navigate = useNavigate();
  const [menuMobileOuvert, setMenuMobileOuvert] = useState(false);
  const [profilOuvert, setProfilOuvert] = useState(false);

  // Compteur d'alertes actives affiché en pastille sur l'entrée « Alertes ».
  // Partage la même clé de cache que la page Alertes : un mouvement de
  // stock qui invalide ['alertes'] met donc aussi la pastille à jour.
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
      // La déconnexion locale doit aboutir même si l'appel serveur échoue
      // (réseau coupé, token déjà expiré) : on purge la session dans tous
      // les cas.
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
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border-subtle bg-surface md:flex">
        <div className="flex items-center gap-2 px-6 py-5">
          <Boxes className="size-6 text-primary" aria-hidden="true" />
          <span className="font-semibold text-secondary">StockFlow</span>
        </div>

        <ListeNavigation role={session?.utilisateur.role} nombreAlertes={nombreAlertes} />
      </aside>

      <MenuMobile
        ouvert={menuMobileOuvert}
        onFermer={() => setMenuMobileOuvert(false)}
        role={session?.utilisateur.role}
        nombreAlertes={nombreAlertes}
        nomEntreprise={session?.entreprise.nom}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-border-subtle bg-surface px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuMobileOuvert(true)}
              aria-label={
                nombreAlertes > 0
                  ? `Ouvrir le menu — ${nombreAlertes} alerte${nombreAlertes > 1 ? 's' : ''} active${nombreAlertes > 1 ? 's' : ''}`
                  : 'Ouvrir le menu'
              }
              className="relative -ml-1 rounded-(--radius-button) p-1.5 text-text-secondary hover:bg-background hover:text-text-primary md:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
              {nombreAlertes > 0 && (
                <span
                  className="absolute top-1 right-1 inline-flex size-2 rounded-full bg-error"
                  aria-hidden="true"
                />
              )}
            </button>
            <span className="truncate text-sm font-medium text-text-primary">
              {session?.entreprise.nom}
            </span>
          </div>

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

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <ProfilModal ouvert={profilOuvert} onFermer={() => setProfilOuvert(false)} />
    </div>
  );
}
