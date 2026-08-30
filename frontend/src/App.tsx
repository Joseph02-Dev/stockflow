import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { ConnexionPage } from '@/features/auth/ConnexionPage';
import { InscriptionPage } from '@/features/auth/InscriptionPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
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

export function App() {
  return (
    <Routes>
      <Route element={<RoutePublique />}>
        <Route path="/connexion" element={<ConnexionPage />} />
        <Route path="/inscription" element={<InscriptionPage />} />
      </Route>

      <Route element={<RouteProtegee />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
