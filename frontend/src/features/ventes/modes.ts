import { Banknote, Clock3, Smartphone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ModePaiement } from './types';

/**
 * Modes de paiement : libellé, icône et couleur de marque. Orange Money et
 * MTN MoMo sont de simples étiquettes (aucune intégration).
 */
export const MODES: Record<ModePaiement, { libelle: string; Icone: LucideIcon; actif: string; point: string }> = {
  ESPECES: { libelle: 'Espèces', Icone: Banknote, actif: 'border-ok bg-ok text-white', point: 'bg-ok' },
  ORANGE_MONEY: {
    libelle: 'Orange Money',
    Icone: Smartphone,
    actif: 'border-orange-money bg-orange-money text-white',
    point: 'bg-orange-money',
  },
  MTN_MOMO: { libelle: 'MTN MoMo', Icone: Smartphone, actif: 'border-mtn bg-mtn text-ink-900', point: 'bg-mtn' },
  CREDIT: { libelle: 'Crédit', Icone: Clock3, actif: 'border-faible bg-faible text-white', point: 'bg-faible' },
};
