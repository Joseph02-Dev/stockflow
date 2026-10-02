import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Building2, LayoutDashboard, LogOut, ScrollText, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/patterns/Logo';
import { BarreProgression } from '@/components/patterns/BarreProgression';
import { clearSessionConsole, useSessionConsole } from './session';

const NAVIGATION = [
  { to: '/console/apercu', libelle: 'Vue d’ensemble', Icone: LayoutDashboard },
  { to: '/console/entreprises', libelle: 'Entreprises', Icone: Building2 },
  { to: '/console/journal', libelle: 'Journal d’audit', Icone: ScrollText },
];

/**
 * Chrome de la console. Toute la zone porte .zone-console : la couleur
 * d'action y devient le violet console, si bien qu'aucun composant
 * partagé ne peut afficher le bleu de l'espace client.
 *
 * Sous 1280 px, la barre latérale se réduit à un rail d’icônes : les
 * tableaux denses gardent toute leur largeur dès 1024 px.
 */
export function ConsoleLayout() {
  const session = useSessionConsole();
  const navigate = useNavigate();
  const location = useLocation();

  if (!session) return <Navigate to="/console/connexion" replace />;

  function seDeconnecter() {
    // Pas de révocation serveur : le token console n'a pas de refresh et
    // expire seul (2 h). Effacer la session locale suffit à fermer l'accès.
    clearSessionConsole();
    navigate('/console/connexion', { replace: true });
  }

  return (
    <div className="zone-console flex min-h-full">
      <BarreProgression />
      <aside className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col bg-console-rail xl:w-[232px]">
        <div className="flex h-[60px] items-center justify-center gap-2.5 border-b border-white/[0.06] px-3 xl:justify-start xl:px-4">
          <Logo taille={28} />
          <div className="hidden min-w-0 leading-tight xl:block">
            <p className="text-panneau text-white">StockFlow</p>
            <p className="text-meta text-console-clair">Console opérateur</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2 pt-5 xl:px-3" aria-label="Navigation de la console">
          {NAVIGATION.map(({ to, libelle, Icone }) => (
            <NavLink
              key={to}
              to={to}
              title={libelle}
              className={({ isActive }) =>
                cn(
                  'flex h-9 items-center justify-center gap-2.5 rounded-md px-2.5 text-corps font-medium transition-colors focus-visible:outline-white/70 xl:justify-start',
                  isActive ? 'bg-console text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
                )
              }
            >
              <Icone className="size-[17px] shrink-0" aria-hidden="true" />
              <span className="sr-only xl:not-sr-only xl:truncate">{libelle}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-2 xl:p-3">
          <div className="flex flex-col items-center gap-2 rounded-md bg-console-deep p-2 xl:flex-row xl:p-3">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-console text-meta font-semibold text-white"
              aria-hidden="true"
            >
              {session.operateur.nom
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </span>
            <div className="hidden min-w-0 flex-1 xl:block">
              <p className="truncate text-corps font-medium text-white">{session.operateur.nom}</p>
              <p className="truncate text-meta text-white/60">{session.operateur.email}</p>
            </div>
            <button
              type="button"
              onClick={seDeconnecter}
              title="Se déconnecter"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-white/70"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="sr-only">Se déconnecter</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Bandeau permanent : on n'oublie jamais où l'on se trouve. */}
        <div
          className="sticky top-0 z-30 flex items-center gap-2 bg-console px-4 py-2 text-meta text-white md:px-7"
          role="note"
        >
          <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <p>Console opérateur — tu consultes les données de toutes les entreprises. Chaque action est journalisée.</p>
        </div>
        <main className="flex-1 px-4 pt-6 pb-10 md:px-7">
          <div key={location.pathname} className="entree-page mx-auto w-full max-w-[1280px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
