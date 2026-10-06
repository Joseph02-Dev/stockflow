import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { estTropDeRequetes } from './lib/api';
import { gestionnaireErreursReact, initialiserSurveillance } from './lib/surveillance';
import './index.css';

// Avant le premier rendu : une erreur au démarrage doit aussi remonter.
const surveillanceActive = initialiserSurveillance();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Évite de relancer une requête à chaque retour sur l'onglet :
      // les données de stock n'évoluent pas à la seconde près.
      refetchOnWindowFocus: false,
      // Une seule nouvelle tentative, jamais sur un 429 : relancer
      // aussitôt consommerait le quota sans aucune chance d'aboutir.
      retry: (tentatives, erreur) => tentatives < 1 && !estTropDeRequetes(erreur),
    },
  },
});

createRoot(document.getElementById('root')!, surveillanceActive ? { onUncaughtError: gestionnaireErreursReact } : undefined).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

// Enregistré après le rendu initial, pour ne jamais retarder le premier
// affichage. L'enregistrement peut échouer silencieusement (navigation
// privée stricte, navigateur sans support) : l'application reste
// pleinement fonctionnelle en ligne dans tous les cas, seul le mode
// hors-ligne serait alors indisponible.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Volontairement silencieux — voir commentaire ci-dessus.
    });
  });
}
