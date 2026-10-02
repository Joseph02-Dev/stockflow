import { useQuery } from '@tanstack/react-query';
import { api } from './api';

interface EntrepriseModules {
  moduleInventaires?: boolean;
  moduleTransferts?: boolean;
}

/**
 * Modules activés pour l'entreprise de l'utilisateur, réglés par un
 * opérateur depuis la console. Sert uniquement à masquer ce qui n'est pas
 * disponible : le serveur refuse de toute façon les routes d'un module
 * désactivé. Par défaut (chargement en cours), tout est affiché.
 */
export function useModules() {
  const { data } = useQuery({
    queryKey: ['entreprise'],
    queryFn: async () => (await api.get<EntrepriseModules>('/entreprise')).data,
    staleTime: 5 * 60_000,
  });
  return {
    inventaires: data?.moduleInventaires ?? true,
    transferts: data?.moduleTransferts ?? true,
  };
}
