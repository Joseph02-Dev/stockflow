import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PreferenceTheme } from '@/lib/theme';

/**
 * Requêtes partagées entre les sections des paramètres et le résumé du menu
 * (mêmes clés de cache : une seule requête par donnée).
 */

export interface EntrepriseDetail {
  id: string;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  rccm: string | null;
  nif: string | null;
  logoUrl: string | null;
}

/** Mentions attendues en en-tête de tout document opposable. */
export const CHAMPS_IDENTITE = [
  { champ: 'adresse', libelle: 'Adresse' },
  { champ: 'telephone', libelle: 'Téléphone' },
  { champ: 'email', libelle: 'Email' },
  { champ: 'rccm', libelle: 'RCCM' },
  { champ: 'nif', libelle: 'NIF' },
] as const;

export type ChampIdentite = (typeof CHAMPS_IDENTITE)[number]['champ'];

export interface UtilisateurListe {
  id: string;
  email: string;
  nom: string;
  role: 'ADMIN' | 'GESTIONNAIRE';
  desactiveAt: string | null;
  desactivePar: { nom: string } | null;
}

export interface Abonnement {
  id: string;
  url: string;
  evenements: string[];
  actif: boolean;
  echecsConsecutifs: number;
  createdAt: string;
}

export function useEntreprise() {
  return useQuery({
    queryKey: ['entreprise'],
    queryFn: async () => (await api.get<EntrepriseDetail>('/entreprise')).data,
  });
}

export function useUtilisateurs() {
  return useQuery({
    queryKey: ['utilisateurs'],
    queryFn: async () => (await api.get<UtilisateurListe[]>('/users')).data,
  });
}

export function useWebhooks(actif: boolean) {
  return useQuery({
    queryKey: ['webhooks'],
    enabled: actif,
    queryFn: async () => (await api.get<Abonnement[]>('/webhooks')).data,
  });
}

/** Choix d'apparence : préférence propre à l'appareil. */
export const MODES_APPARENCE: { valeur: PreferenceTheme; libelle: string; aide: string }[] = [
  { valeur: 'light', libelle: 'Clair', aide: 'Fond papier, lecture de jour' },
  { valeur: 'dark', libelle: 'Sombre', aide: 'Repose les yeux le soir' },
  { valeur: 'auto', libelle: 'Automatique', aide: 'Suit votre téléphone ou ordinateur' },
];
