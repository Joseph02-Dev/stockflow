import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { EtatEntreprise } from './types';

const ETATS: Record<EtatEntreprise, { libelle: string; variant: 'ok' | 'rupture' | 'faible' }> = {
  ACTIVE: { libelle: 'Active', variant: 'ok' },
  SUSPENDUE: { libelle: 'Suspendue', variant: 'rupture' },
  INACTIVE: { libelle: 'Inactive', variant: 'faible' },
  JAMAIS_DEMARREE: { libelle: 'Jamais démarrée', variant: 'faible' },
};

/** Pastille d'état — libellé toujours écrit, cadenas en plus pour une suspension. */
export function EtatBadge({ etat }: { etat: EtatEntreprise }) {
  const { libelle, variant } = ETATS[etat];
  return (
    <Badge variant={variant} icone={etat === 'SUSPENDUE' ? <Lock className="size-3" aria-hidden="true" /> : undefined}>
      {libelle}
    </Badge>
  );
}
