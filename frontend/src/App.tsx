import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { ConnexionPage } from '@/features/auth/ConnexionPage';
import { InscriptionPage } from '@/features/auth/InscriptionPage';
import { VerifierEmailPage } from '@/features/auth/VerifierEmailPage';
import { InvitationPage } from '@/features/auth/InvitationPage';
import { MotDePasseOubliePage } from '@/features/auth/MotDePasseOubliePage';
import { ReinitialiserMotDePassePage } from '@/features/auth/ReinitialiserMotDePassePage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ProduitsPage } from '@/features/produits/ProduitsPage';
import { ProduitFormPage } from '@/features/produits/ProduitFormPage';
import { StockPage } from '@/features/stock/StockPage';
import { InventaireDetailPage } from '@/features/stock/InventaireDetailPage';
import { CommandesPage } from '@/features/commandes/CommandesPage';
import { CommandeFormPage } from '@/features/commandes/CommandeFormPage';
import { CommandeDetailPage } from '@/features/commandes/CommandeDetailPage';
import { AlertesPage } from '@/features/alertes/AlertesPage';
import { FournisseursPage } from '@/features/fournisseurs/FournisseursPage';
import { FournisseurDetailPage } from '@/features/fournisseurs/FournisseurDetailPage';
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
        <Route path="/mot-de-passe-oublie" element={<MotDePasseOubliePage />} />
        <Route path="/reinitialiser-mot-de-passe" element={<ReinitialiserMotDePassePage />} />
      </Route>

      {/*
        L'inscription est volontairement hors de RoutePublique : elle
        enregistre la session dès l'étape 1 (nécessaire pour créer le
        premier emplacement à l'étape 2). Un garde de redirection ici
        éjecterait l'utilisateur vers le dashboard au milieu du parcours.
        La page gère elle-même le cas d'un utilisateur déjà connecté.
      */}
      <Route path="/inscription" element={<InscriptionPage />} />
      {/* Hors RoutePublique pour la même raison que /inscription : une
          session existante (même dans un autre onglet) ne doit jamais
          empêcher le traitement du lien de confirmation lui-même. */}
      <Route path="/verifier-email" element={<VerifierEmailPage />} />

      <Route element={<RouteProtegee />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/produits" element={<ProduitsPage />} />
          <Route path="/produits/nouveau" element={<ProduitFormPage />} />
          <Route path="/produits/:id" element={<ProduitFormPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/inventaires/:id" element={<InventaireDetailPage />} />
          <Route path="/commandes" element={<CommandesPage />} />
          <Route path="/commandes/nouvelle" element={<CommandeFormPage />} />
          <Route path="/commandes/:id" element={<CommandeDetailPage />} />
          <Route path="/alertes" element={<AlertesPage />} />
          <Route path="/fournisseurs" element={<FournisseursPage />} />
          <Route path="/fournisseurs/:id" element={<FournisseurDetailPage />} />
          <Route element={<RouteAdmin />}>
            <Route path="/parametres" element={<ParametresPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
