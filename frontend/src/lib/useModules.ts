import { useQuery } from '@tanstack/react-query';
import { api } from './api';

interface EntrepriseModules {
  moduleInventaires?: boolean;
  moduleTransferts?: boolean;
  /** Interrupteurs globaux coupés côté serveur (FONCTIONNALITES_DESACTIVEES). */
  fonctionnalitesSuspendues?: string[];
}

/**
 * Modules activés pour l'entreprise de l'utilisateur, réglés par un
 * opérateur depuis la console. Sert uniquement à masquer ce qui n'est pas
 * disponible : le serveur refuse de toute façon les routes d'un module
 * désactivé. Par défaut (chargement en cours), tout est affiché.
 * S'y ajoutent les fonctionnalités coupées pour tous par l'exploitation.
 */
export function useModules() {
  const { data } = useQuery({
    queryKey: ['entreprise'],
    queryFn: async () => (await api.get<EntrepriseModules>('/entreprise')).data,
    staleTime: 5 * 60_000,
  });
  const suspendue = (nom: string) => data?.fonctionnalitesSuspendues?.includes(nom) ?? false;
  return {
    inventaires: data?.moduleInventaires ?? true,
    transferts: data?.moduleTransferts ?? true,
    rapports: !suspendue('rapports'),
    import: !suspendue('import'),
  };
}
