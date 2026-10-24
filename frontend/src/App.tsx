import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
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
import { ModelesPage } from '@/features/produits/ModelesPage';
import { ModeleFormPage } from '@/features/produits/ModeleFormPage';
import { ReapprovisionnementPage } from '@/features/commandes/ReapprovisionnementPage';
import { StockPage } from '@/features/stock/StockPage';
import { InventaireDetailPage } from '@/features/stock/InventaireDetailPage';
import { CommandesPage } from '@/features/commandes/CommandesPage';
import { CommandeFormPage } from '@/features/commandes/CommandeFormPage';
import { CommandeDetailPage } from '@/features/commandes/CommandeDetailPage';
import { AlertesPage } from '@/features/alertes/AlertesPage';
import { FournisseursPage } from '@/features/fournisseurs/FournisseursPage';
import { FournisseurDetailPage } from '@/features/fournisseurs/FournisseurDetailPage';
import { ClientsPage } from '@/features/clients/ClientsPage';
import { VentesPage } from '@/features/ventes/VentesPage';
import { NouvelleVentePage } from '@/features/ventes/NouvelleVentePage';
import { VenteDetailPage } from '@/features/ventes/VenteDetailPage';
import { CreancesPage } from '@/features/creances/CreancesPage';
import { PeremptionsPage } from '@/features/peremptions/PeremptionsPage';
import { PertesPage } from '@/features/pertes/PertesPage';
import { DeclarationCassePage } from '@/features/pertes/DeclarationCassePage';
import { RetoursFournisseurPage } from '@/features/retours/RetoursFournisseurPage';
import { RapportsPage } from '@/features/rapports/RapportsPage';
import { StatistiquesPage } from '@/features/statistiques/StatistiquesPage';
import { ValorisationPage } from '@/features/finance/ValorisationPage';
import { RotationPage } from '@/features/finance/RotationPage';
import { ParametresPage } from '@/features/parametres/ParametresPage';
import { EmplacementsPage } from '@/features/parametres/EmplacementsPage';
import { CategoriesMarquesPage } from '@/features/parametres/CategoriesMarquesPage';
import { useSession } from '@/lib/useSession';
import { LoadingState } from '@/components/patterns/States';
import { moduleOuRechargement } from '@/lib/miseAJour';
import { estLanceeCommeAppli } from '@/lib/installation';

// Console opérateur : chargée à la demande, jamais embarquée dans le
// bundle de l'application cliente.
const ConsoleApp = lazy(() => moduleOuRechargement(import('@/features/console/ConsoleApp')));
const AccueilPage = lazy(() => moduleOuRechargement(import('@/features/accueil/AccueilPage')));
// Écran d'import : lui seul embarque la lecture des CSV et des fichiers Excel.
const ImportPage = lazy(() =>
  moduleOuRechargement(import('@/features/import/ImportPage')).then((m) => ({ default: m.ImportPage })),
);

/**
 * Redirige vers la connexion si aucune session valide n'est présente.
 * Exception : la racine du site affiche la page d'accueil publique au
 * visiteur ; un utilisateur connecté y voit toujours son tableau de bord.
 */
function RouteProtegee() {
  const session = useSession();
  const { pathname } = useLocation();
  if (session) return <Outlet />;
  // Application installée : la page d'accueil publique (présentation du
  // produit) n'y a pas sa place, on ouvre directement la connexion.
  if (pathname === '/' && !estLanceeCommeAppli()) {
    return (
      <Suspense fallback={<LoadingState variante="page" />}>
        <AccueilPage />
      </Suspense>
    );
  }
  return <Navigate to="/connexion" replace />;
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
          <Route
            path="/produits/import"
            element={
              <Suspense fallback={<LoadingState variante="page" />}>
                <ImportPage />
              </Suspense>
            }
          />
          <Route path="/produits/modeles" element={<ModelesPage />} />
          <Route path="/produits/modeles/nouveau" element={<ModeleFormPage />} />
          <Route path="/produits/modeles/:id" element={<ModeleFormPage />} />
          <Route path="/produits/:id" element={<ProduitFormPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/inventaires/:id" element={<InventaireDetailPage />} />
          <Route path="/reapprovisionnement" element={<ReapprovisionnementPage />} />
          <Route path="/commandes" element={<CommandesPage />} />
          <Route path="/commandes/nouvelle" element={<CommandeFormPage />} />
          <Route path="/commandes/:id" element={<CommandeDetailPage />} />
          <Route path="/alertes" element={<AlertesPage />} />
          <Route path="/fournisseurs" element={<FournisseursPage />} />
          <Route path="/fournisseurs/:id" element={<FournisseurDetailPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/ventes" element={<VentesPage />} />
          <Route path="/ventes/nouvelle" element={<NouvelleVentePage />} />
          <Route path="/ventes/:id" element={<VenteDetailPage />} />
          <Route path="/creances" element={<CreancesPage />} />
          <Route path="/peremptions" element={<PeremptionsPage />} />
          <Route path="/pertes" element={<PertesPage />} />
          <Route path="/pertes/declarer" element={<DeclarationCassePage />} />
          <Route path="/retours-fournisseur" element={<RetoursFournisseurPage />} />
          <Route path="/rapports" element={<RapportsPage />} />
          <Route path="/statistiques" element={<StatistiquesPage />} />
          <Route path="/valorisation" element={<ValorisationPage />} />
          <Route path="/rotation" element={<RotationPage />} />
          <Route element={<RouteAdmin />}>
            <Route path="/parametres" element={<ParametresPage />} />
            <Route path="/emplacements" element={<EmplacementsPage />} />
            <Route path="/categories" element={<CategoriesMarquesPage />} />
          </Route>
        </Route>
      </Route>

      {/* Console opérateur : hors de toutes les gardes clientes, avec sa
          propre session (stockflow.console-session) et sa propre garde. */}
      <Route
        path="/console/*"
        element={
          <Suspense fallback={<LoadingState />}>
            <ConsoleApp />
          </Suspense>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
