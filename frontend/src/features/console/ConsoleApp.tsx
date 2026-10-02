import { Navigate, Route, Routes } from 'react-router-dom';
import { ConsoleLayout } from './ConsoleLayout';
import { ConsoleConnexionPage } from './ConsoleConnexionPage';
import { ConsoleApercuPage } from './ConsoleApercuPage';
import { ConsoleEntreprisesPage } from './ConsoleEntreprisesPage';
import { ConsoleEntreprisePage } from './ConsoleEntreprisePage';
import { ConsoleJournalPage } from './ConsoleJournalPage';

/**
 * Arborescence de la console, montée sous /console/* et chargée à la
 * demande : un utilisateur de l'application cliente ne télécharge jamais
 * ce code. Totalement indépendante des gardes de route clientes.
 */
export default function ConsoleApp() {
  return (
    <Routes>
      <Route path="connexion" element={<ConsoleConnexionPage />} />
      <Route element={<ConsoleLayout />}>
        <Route path="apercu" element={<ConsoleApercuPage />} />
        <Route path="entreprises" element={<ConsoleEntreprisesPage />} />
        <Route path="entreprises/:id" element={<ConsoleEntreprisePage />} />
        <Route path="journal" element={<ConsoleJournalPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/console/apercu" replace />} />
    </Routes>
  );
}
