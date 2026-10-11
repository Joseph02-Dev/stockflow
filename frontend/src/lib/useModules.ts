import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { StrategieSortie } from './strategieSortie';

interface EntrepriseModules {
  moduleInventaires?: boolean;
  moduleTransferts?: boolean;
  moduleLots?: boolean;
  moduleArborescence?: boolean;
  moduleVariantes?: boolean;
  moduleConditionnements?: boolean;
  moduleNumerosSerie?: boolean;
  moduleStrategiesSortie?: boolean;
  moduleReapprovisionnement?: boolean;
  moduleRangement?: boolean;
  dernierReapproAt?: string | null;
  strategieSortie?: StrategieSortie;
  /** Interrupteurs globaux coupés côté serveur (FONCTIONNALITES_DESACTIVEES). */
  fonctionnalitesSuspendues?: string[];
}

/**
 * Modules activés pour l'entreprise de l'utilisateur : ceux de l'offre
 * (réglés par un opérateur depuis la console) et les modules métier
 * (réglés par l'administrateur dans Paramètres). Sert uniquement à masquer
 * ce qui n'est pas disponible : le serveur refuse de toute façon les routes
 * d'un module désactivé. Pendant le chargement, chaque module garde sa
 * valeur par défaut côté serveur.
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
    charge: data !== undefined,
    inventaires: data?.moduleInventaires ?? true,
    transferts: data?.moduleTransferts ?? true,
    lots: data?.moduleLots ?? true,
    arborescence: data?.moduleArborescence ?? false,
    variantes: data?.moduleVariantes ?? false,
    conditionnements: data?.moduleConditionnements ?? false,
    numerosSerie: data?.moduleNumerosSerie ?? false,
    strategiesSortie: data?.moduleStrategiesSortie ?? false,
    reapprovisionnement: (data?.moduleReapprovisionnement ?? false) && !suspendue('reapprovisionnement'),
    rangement: data?.moduleRangement ?? false,
    dernierReapproAt: data?.dernierReapproAt ?? null,
    /** Stratégie de sortie par défaut de l'entreprise. */
    strategieSortie: data?.strategieSortie ?? 'FEFO',
    rapports: !suspendue('rapports'),
    import: !suspendue('import'),
  };
}
