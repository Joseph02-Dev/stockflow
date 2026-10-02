import type { VarianteBadge } from '@/components/ui/Badge';

export type StatutCommande = 'BROUILLON' | 'ENVOYEE' | 'RECUE' | 'ANNULEE';

/**
 * Une commande envoyée est « en route » : c'est une information utile
 * (action), pas une alerte — d'où l'ultramarine plutôt que l'ambre.
 * Une annulation est un état clos, pas une erreur : neutre.
 */
export const STATUTS_COMMANDE: Record<StatutCommande, { libelle: string; variant: VarianteBadge }> = {
  BROUILLON: { libelle: 'Brouillon', variant: 'neutral' },
  ENVOYEE: { libelle: 'En route', variant: 'action' },
  RECUE: { libelle: 'Reçue', variant: 'ok' },
  ANNULEE: { libelle: 'Annulée', variant: 'neutral' },
};
