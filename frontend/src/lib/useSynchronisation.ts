import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  estEnSynchronisation,
  etatFile,
  marquerSynchronise,
  nombreMouvementsEnAttente,
  souscrireFile,
  synchroniserMouvementsEnAttente,
} from './mouvementsHorsLigne';
import { verifierConnexion } from './connectivite';
import { useEnLigne } from './useEnLigne';

export type StatutSynchronisation = 'en-ligne' | 'hors-ligne' | 'synchronisation';

/**
 * Déclenche automatiquement la synchronisation de la file de mouvements
 * en attente dès que le serveur redevient joignable (retour du réseau ou
 * réactivation de la connexion par l'utilisateur), et expose un état
 * exploitable par l'indicateur visuel de la sidebar.
 */
export function useSynchronisation(apresSynchronisation?: () => Promise<void>) {
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

  const file = useSyncExternalStore(souscrireFile, etatFile, etatFile);
  const [manuelleEnCours, setManuelleEnCours] = useState(false);

  /**
   * Bouton « Synchroniser » : vérifie le serveur, envoie la file puis
   * recharge les données affichées. Sans réseau, ne fait rien : l'envoi
   * repartira tout seul au retour de la connexion.
   */
  const synchroniser = useCallback(async () => {
    setManuelleEnCours(true);
    try {
      if (!(await verifierConnexion())) return;
      const resultat = await synchroniserMouvementsEnAttente();
      await Promise.all([queryClient.invalidateQueries(), apresSynchronisation?.()]);
      if (resultat.echecs.length === 0 && nombreMouvementsEnAttente() === 0) marquerSynchronise();
    } finally {
      setManuelleEnCours(false);
    }
  }, [queryClient, apresSynchronisation]);

  const statut: StatutSynchronisation = !enLigne
    ? 'hors-ligne'
    : enCoursDeSynchro || manuelleEnCours
      ? 'synchronisation'
      : 'en-ligne';

  return { statut, nombreEnAttente, dernierResultat, file, synchroniser };
}
