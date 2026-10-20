import { Banknote, Clock3, Smartphone, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ModePaiement } from './types';

/**
 * Modes de paiement : libellé, icône et couleur de marque. Orange Money et
 * MTN MoMo sont de simples étiquettes (aucune intégration).
 */
export const MODES: Record<
  ModePaiement,
  { libelle: string; Icone: LucideIcon; actif: string; point: string; /** Tuile d'icône dans les listes. */ teinte: string }
> = {
  ESPECES: {
    libelle: 'Espèces',
    Icone: Banknote,
    actif: 'border-ok bg-ok text-sur-couleur',
    point: 'bg-ok',
    teinte: 'bg-ok-wash text-ok',
  },
  ORANGE_MONEY: {
    libelle: 'Orange Money',
    Icone: Smartphone,
    actif: 'border-orange-money bg-orange-money text-white',
    point: 'bg-orange-money',
    teinte: 'bg-orange-money/12 text-orange-money',
  },
  MTN_MOMO: {
    libelle: 'MTN MoMo',
    Icone: Smartphone,
    actif: 'border-mtn bg-mtn text-ink-900',
    point: 'bg-mtn',
    teinte: 'bg-mtn/25 text-ink-900',
  },
  CREDIT: {
    libelle: 'Crédit',
    Icone: Clock3,
    actif: 'border-faible bg-faible text-sur-couleur',
    point: 'bg-faible',
    teinte: 'bg-faible-wash text-faible',
  },
  AVOIR: {
    libelle: 'Avoir (retour)',
    Icone: Undo2,
    actif: 'border-action bg-action text-sur-couleur',
    point: 'bg-action',
    teinte: 'bg-action-wash text-action',
  },
};
