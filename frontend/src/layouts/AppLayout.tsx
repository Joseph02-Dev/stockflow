import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Boxes,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  Truck,
  Warehouse,
} from 'lucide-react';
import { api } from '@/lib/api';
import { clearSession, getSession } from '@/lib/session';
import { useSession } from '@/lib/useSession';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';

const liens = [
  { to: '/', libelle: 'Dashboard', Icone: LayoutDashboard, exact: true },
  { to: '/produits', libelle: 'Produits', Icone: Package },
  { to: '/stock', libelle: 'Stock & Mouvements', Icone: Warehouse },
  { to: '/fournisseurs', libelle: 'Fournisseurs', Icone: Truck },
  { to: '/alertes', libelle: 'Alertes', Icone: Bell },
];

export function AppLayout() {
  const session = useSession();
  const navigate = useNavigate();

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

        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Navigation principale">
          {liens.map(({ to, libelle, Icone, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-(--radius-button) px-3 py-2 text-sm font-medium transition-colors',
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

          {/* Paramètres : absent du menu pour un Gestionnaire — on ne
              montre pas ce que l'utilisateur ne peut pas faire. */}
          {session?.utilisateur.role === 'ADMIN' && (
            <NavLink
              to="/parametres"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-(--radius-button) px-3 py-2 text-sm font-medium transition-colors',
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
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border-subtle bg-surface px-6 py-3">
          <span className="truncate text-sm font-medium text-text-primary">
            {session?.entreprise.nom}
          </span>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initiales}
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-sm text-text-primary">{session?.utilisateur.nom}</span>
                <Badge variant="neutral">
                  {session?.utilisateur.role === 'ADMIN' ? 'Administrateur' : 'Gestionnaire'}
                </Badge>
              </div>
            </div>

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

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
