import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { ConnexionPage } from '@/features/auth/ConnexionPage';
import { InscriptionPage } from '@/features/auth/InscriptionPage';
import { InvitationPage } from '@/features/auth/InvitationPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ProduitsPage } from '@/features/produits/ProduitsPage';
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
        <Route path="/invitation" element={<InvitationPage />} />
      </Route>

      {/*
        L'inscription est volontairement hors de RoutePublique : elle
        enregistre la session dès l'étape 1 (nécessaire pour créer le
        premier emplacement à l'étape 2). Un garde de redirection ici
        éjecterait l'utilisateur vers le dashboard au milieu du parcours.
        La page gère elle-même le cas d'un utilisateur déjà connecté.
      */}
      <Route path="/inscription" element={<InscriptionPage />} />

      <Route element={<RouteProtegee />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/produits" element={<ProduitsPage />} />
          <Route element={<RouteAdmin />}>
            <Route path="/parametres" element={<ParametresPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
