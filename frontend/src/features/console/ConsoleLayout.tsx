import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Building2, LayoutDashboard, LogOut, RotateCcwClock, ShieldCheck, Timer } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/patterns/Logo';
import { BarreProgression } from '@/components/patterns/BarreProgression';
import { clearSessionConsole, periodeSessionConsole, useSessionConsole } from './session';
import type { SessionConsole } from './session';
import './console.css';

const NAVIGATION = [
  { to: '/console/apercu', libelle: 'Vue d’ensemble', court: 'Vue d’ensemble', Icone: LayoutDashboard },
  { to: '/console/entreprises', libelle: 'Entreprises', court: 'Entreprises', Icone: Building2 },
  { to: '/console/journal', libelle: 'Journal d’audit', court: 'Journal', Icone: RotateCcwClock },
];

/** « 1 h 25 », « 12 min » : temps de session restant, à la minute. */
function dureeRestante(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, '0')}`;
}

/**
 * Temps restant avant l'expiration du token opérateur (2 h, sans
 * renouvellement). À zéro, la session locale est effacée : la console
 * revient à la connexion sans attendre un refus du serveur.
 */
function useSessionRestante(session: SessionConsole | null) {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const minuterie = window.setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => window.clearInterval(minuterie);
  }, []);
  const periode = session ? periodeSessionConsole(session) : null;
  const restant = periode ? periode.fin - maintenant : null;
  useEffect(() => {
    if (restant !== null && restant <= 0) clearSessionConsole();
  }, [restant]);
  if (!periode || restant === null) return null;
  return { restant, part: Math.min(1, Math.max(0, restant / (periode.fin - periode.debut))) };
}

/**
 * Chrome de la console. Même cuivre que l'espace client : le contexte
 * privilégié se lit à la barre sombre, au bandeau permanent et à la
 * mention « Console opérateur ».
 *
 * Sous 1280 px, la barre latérale se réduit à un rail d’icônes ; sur
 * téléphone, elle laisse place à une barre en haut et une navigation en bas.
 */
export function ConsoleLayout() {
  const session = useSessionConsole();
  const navigate = useNavigate();
  const location = useLocation();
  const restante = useSessionRestante(session);

  if (!session) return <Navigate to="/console/connexion" replace />;

  function seDeconnecter() {
    // Pas de révocation serveur : le token console n'a pas de refresh et
    // expire seul (2 h). Effacer la session locale suffit à fermer l'accès.
    clearSessionConsole();
    navigate('/console/connexion', { replace: true });
  }

  const initiales = session.operateur.nom
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-full">
      <BarreProgression />
      <aside className="console-rail sticky top-0 hidden h-dvh w-16 shrink-0 flex-col px-2 py-3.5 text-white md:flex xl:w-[236px] xl:px-3">
        <div className="flex items-center justify-center gap-2.5 border-b border-white/[0.07] px-1.5 pb-4 xl:justify-start">
          <Logo taille={28} />
          <div className="hidden min-w-0 leading-tight xl:block">
            <p className="font-display text-[15px] font-semibold text-white">NimbaFlow</p>
            <p className="text-meta text-console-clair">Console opérateur</p>
          </div>
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-0.5" aria-label="Navigation de la console">
          {NAVIGATION.map(({ to, libelle, Icone }) => (
            <NavLink key={to} to={to} title={libelle} className="console-nav-lien justify-center xl:justify-start">
              <Icone className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="sr-only xl:not-sr-only xl:truncate">{libelle}</span>
            </NavLink>
          ))}
        </nav>

        <div className="rounded-[14px] border border-white/[0.06] bg-console-deep p-2 xl:p-3">
          <div className="flex items-center justify-center gap-2.5 xl:justify-start">
            <span
              className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-action text-meta font-bold text-sur-couleur"
              aria-hidden="true"
            >
              {initiales}
            </span>
            <div className="hidden min-w-0 xl:block">
              <p className="truncate text-corps font-semibold text-white">{session.operateur.nom}</p>
              <p className="truncate text-meta text-white/55">{session.operateur.email}</p>
            </div>
          </div>
          {restante && (
            <div className="mt-2.5 hidden xl:block">
              <p className="flex items-center justify-between text-meta text-white/65">
                <span className="inline-flex items-center gap-1.5">
                  <Timer className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Session
                </span>
                <span>{dureeRestante(restante.restant)} restantes</span>
              </p>
              <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-console-clair" style={{ width: `${restante.part * 100}%` }} />
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={seDeconnecter}
            title="Se déconnecter"
            className="mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-[9px] border border-white/[0.12] text-meta font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-white/70"
          >
            <LogOut className="size-[15px]" strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only xl:not-sr-only">Se déconnecter</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30">
          {/* Téléphone : marque, temps de session et déconnexion. */}
          <div className="flex h-14 items-center justify-between gap-3 bg-console-rail px-4 text-white md:hidden">
            <div className="flex items-center gap-2.5">
              <Logo taille={26} />
              <div className="leading-tight">
                <p className="font-display text-[15px] font-semibold">NimbaFlow</p>
                <p className="text-meta text-console-clair">Console</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {restante && (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 text-meta font-semibold">
                  <Timer className="size-3.5 text-console-clair" strokeWidth={1.75} aria-hidden="true" />
                  {dureeRestante(restante.restant)}
                </span>
              )}
              <button
                type="button"
                onClick={seDeconnecter}
                className="flex size-8 items-center justify-center rounded-md text-white/75 hover:bg-white/10 hover:text-white"
              >
                <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
                <span className="sr-only">Se déconnecter</span>
              </button>
            </div>
          </div>
          {/* Bandeau permanent : on n'oublie jamais où l'on se trouve. */}
          <div
            className="flex items-center gap-2 border-b border-white/[0.06] bg-console-deep px-4 py-2 text-meta text-white/85 md:px-7"
            role="note"
          >
            <ShieldCheck className="size-[15px] shrink-0 text-console-clair" strokeWidth={1.75} aria-hidden="true" />
            <p>Console opérateur : données de toutes les entreprises. Chaque action est journalisée.</p>
          </div>
        </div>
        <main className="flex-1 px-4 pt-6 pb-24 md:px-7 md:pb-10">
          <div key={location.pathname} className="entree-page mx-auto w-full max-w-[1280px]">
            <Outlet />
          </div>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 bg-console-rail px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] md:hidden"
        aria-label="Navigation de la console"
      >
        {NAVIGATION.map(({ to, court, Icone }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 rounded-[10px] py-1.5 text-[11.5px] font-semibold',
                isActive ? 'bg-white/10 text-white' : 'text-white/65',
              )
            }
          >
            <Icone className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
            {court}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
