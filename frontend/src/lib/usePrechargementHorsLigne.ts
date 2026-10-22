import { useEffect } from 'react';
import { prechargerEcrans } from './prechargementHorsLigne';
import { useEnLigne } from './useEnLigne';

/**
 * Précharge les écrans pour le mode hors ligne au démarrage puis à chaque
 * retour du réseau (au plus une fois toutes les 5 minutes, voir
 * prechargerEcrans). `pret` : modules de l'entreprise connus.
 */
export function usePrechargementHorsLigne(admin: boolean, lots: boolean, rangement: boolean, pret: boolean) {
  const enLigne = useEnLigne();
  useEffect(() => {
    if (enLigne && pret) void prechargerEcrans({ admin, lots, rangement });
  }, [enLigne, pret, admin, lots, rangement]);
}
