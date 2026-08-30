import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { ConnexionPage } from '@/features/auth/ConnexionPage';
import { InscriptionPage } from '@/features/auth/InscriptionPage';
import { InvitationPage } from '@/features/auth/InvitationPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ParametresPage } from '@/features/parametres/ParametresPage';
import { useSession } from '@/lib/useSession';

/** Redirige vers la connexion si aucune session valide n'est présente. */
function RouteProtegee() {
  const session = useSession();
  return session ? <Outlet /> : <Navigate to="/connexion" replace />;
}

/** Empêche un utilisateur déjà connecté de revoir les écrans d'auth. */
function RoutePublique() {
  const session = useSession();
  return session ? <Navigate to="/" replace /> : <Outlet />;
}

/**
 * Restriction par rôle. C'est une protection d'expérience utilisateur,
 * pas de sécurité : le backend refuse de toute façon les actions
 * réservées à l'Admin (AUTH-004-BE). Les deux sont nécessaires.
 */
function RouteAdmin() {
  const session = useSession();
  return session?.utilisateur.role === 'ADMIN' ? <Outlet /> : <Navigate to="/" replace />;
}

export function App() {
  return (
    <Routes>
      <Route element={<RoutePublique />}>
        <Route path="/connexion" element={<ConnexionPage />} />
        <Route path="/inscription" element={<InscriptionPage />} />
        <Route path="/invitation" element={<InvitationPage />} />
      </Route>

      <Route element={<RouteProtegee />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route element={<RouteAdmin />}>
            <Route path="/parametres" element={<ParametresPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
