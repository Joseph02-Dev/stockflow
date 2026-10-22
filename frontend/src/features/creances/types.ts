import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CategorieTarifaire } from '@/features/clients/types';

export type CleTranche = 'A_JOUR' | 'RETARD_1_30' | 'RETARD_31_60' | 'RETARD_PLUS_60';

export interface Debiteur {
  client: {
    id: string;
    nom: string;
    telephone: string | null;
    nomCommerce: string | null;
    categorie: CategorieTarifaire;
    plafondCredit: number | null;
  };
  solde: number;
  ancienneteJours: number;
  /** Pire retard sur l'échéance parmi ses ventes (0 = à jour). */
  retardJours: number;
  dernierReglementAt: string | null;
  echeanceAt: string | null;
  montantEnRetard: number;
  nombreVentes: number;
}

export interface Creances {
  resume: {
    totalDu: number;
    nombreClients: number;
    montantEnRetard: number;
    encaisseCetteSemaine: number;
    /** Ventilation par vente (et non par client) selon son retard. */
    tranches: { cle: CleTranche; libelle: string; montant: number; nombreVentes: number }[];
  };
  debiteurs: Debiteur[];
}

/** Mêmes bornes que le serveur (creances.service.ts, TRANCHES). */
export function tranche(retardJours: number): CleTranche {
  if (retardJours <= 0) return 'A_JOUR';
  if (retardJours <= 30) return 'RETARD_1_30';
  if (retardJours <= 60) return 'RETARD_31_60';
  return 'RETARD_PLUS_60';
}

/** Une seule requête pour les écrans Clients et Créances (même clé de cache). */
export function useCreances() {
  return useQuery({
    queryKey: ['creances'],
    queryFn: async () => (await api.get<Creances>('/creances')).data,
  });
}
