import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { nombreMouvementsEnAttente, synchroniserMouvementsEnAttente } from './mouvementsHorsLigne';
import { useEnLigne } from './useEnLigne';

export type StatutSynchronisation = 'en-ligne' | 'hors-ligne' | 'synchronisation';

/**
 * Déclenche automatiquement la synchronisation de la file de mouvements
 * en attente dès que le réseau revient, et expose un état exploitable
 * par l'indicateur visuel de la sidebar.
 */
export function useSynchronisation() {
  const enLigne = useEnLigne();
  const queryClient = useQueryClient();
  const [nombreEnAttente, setNombreEnAttente] = useState(() => nombreMouvementsEnAttente());
  const [enCoursDeSynchro, setEnCoursDeSynchro] = useState(false);
  const [dernierResultat, setDernierResultat] = useState<{ reussis: number; echecs: number } | null>(null);

  // Rafraîchit le compteur régulièrement : la file peut changer depuis
  // n'importe quel écran (modale de mouvement), sans lien direct avec ce
  // composant — un intervalle léger est plus simple qu'un bus d'événements
  // dédié pour un compteur purement informatif.
  useEffect(() => {
    const intervalle = setInterval(() => setNombreEnAttente(nombreMouvementsEnAttente()), 2000);
    return () => clearInterval(intervalle);
  }, []);

  useEffect(() => {
    if (!enLigne) return;
    if (nombreMouvementsEnAttente() === 0) return;

    let annule = false;
    setEnCoursDeSynchro(true);
    synchroniserMouvementsEnAttente().then((resultat) => {
      if (annule) return;
      setEnCoursDeSynchro(false);
      setNombreEnAttente(nombreMouvementsEnAttente());
      setDernierResultat({ reussis: resultat.reussis, echecs: resultat.echecs.length });
      if (resultat.reussis > 0) {
        queryClient.invalidateQueries({ queryKey: ['stock'] });
        queryClient.invalidateQueries({ queryKey: ['mouvements'] });
        queryClient.invalidateQueries({ queryKey: ['alertes'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
    });
    return () => {
      annule = true;
    };
    // Se redéclenche à chaque passage en ligne (enLigne passe à true) —
    // volontairement pas de dépendance sur nombreEnAttente pour éviter
    // une boucle de synchronisations en cascade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLigne]);

  const statut: StatutSynchronisation = !enLigne ? 'hors-ligne' : enCoursDeSynchro ? 'synchronisation' : 'en-ligne';

  return { statut, nombreEnAttente, dernierResultat };
}
