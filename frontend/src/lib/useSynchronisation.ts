import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  estEnSynchronisation,
  nombreMouvementsEnAttente,
  souscrireFile,
  synchroniserMouvementsEnAttente,
} from './mouvementsHorsLigne';
import { useEnLigne } from './useEnLigne';

export type StatutSynchronisation = 'en-ligne' | 'hors-ligne' | 'synchronisation';

/**
 * Déclenche automatiquement la synchronisation de la file de mouvements
 * en attente dès que le serveur redevient joignable (retour du réseau ou
 * réactivation de la connexion par l'utilisateur), et expose un état
 * exploitable par l'indicateur visuel de la sidebar.
 */
export function useSynchronisation() {
  const enLigne = useEnLigne();
  const queryClient = useQueryClient();
  const nombreEnAttente = useSyncExternalStore(souscrireFile, nombreMouvementsEnAttente, () => 0);
  const enCoursDeSynchro = useSyncExternalStore(souscrireFile, estEnSynchronisation, () => false);
  const [dernierResultat, setDernierResultat] = useState<{ reussis: number; echecs: number } | null>(null);
  const fileNonVide = nombreEnAttente > 0;

  // Se déclenche à chaque passage en ligne, et quand un mouvement est mis
  // en file alors que le serveur est joignable. Une coupure pendant le
  // rejeu repasse hors ligne : le retour suivant reprend là où il s'était
  // arrêté. Dépend de « file non vide » et non du nombre exact, pour ne
  // pas relancer à chaque mouvement envoyé.
  useEffect(() => {
    if (!enLigne || !fileNonVide) return;
    void synchroniserMouvementsEnAttente().then((resultat) => {
      if (resultat.reussis > 0) {
        queryClient.invalidateQueries({ queryKey: ['stock'] });
        queryClient.invalidateQueries({ queryKey: ['mouvements'] });
        queryClient.invalidateQueries({ queryKey: ['alertes'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
      setDernierResultat({ reussis: resultat.reussis, echecs: resultat.echecs.length });
    });
  }, [enLigne, fileNonVide, queryClient]);

  const statut: StatutSynchronisation = !enLigne ? 'hors-ligne' : enCoursDeSynchro ? 'synchronisation' : 'en-ligne';

  return { statut, nombreEnAttente, dernierResultat };
}
