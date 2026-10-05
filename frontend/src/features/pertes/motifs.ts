import type { MotifSynthese } from './types';

/** Présentation des motifs : libellé et couleur (barre de répartition, pastilles). */
export const MOTIFS: Record<MotifSynthese, { libelle: string; court: string; fond: string; texte: string }> = {
  CASSE_MANUTENTION: { libelle: 'Casse de manutention', court: 'Casse', fond: 'bg-perte-casse', texte: 'text-perte-casse' },
  DEGAT_EAUX: { libelle: 'Dégât des eaux', court: 'Dégât des eaux', fond: 'bg-perte-eaux', texte: 'text-perte-eaux' },
  VOL: { libelle: 'Vol', court: 'Vol', fond: 'bg-perte-vol', texte: 'text-perte-vol' },
  ERREUR_SAISIE: { libelle: 'Erreur de saisie', court: 'Erreur', fond: 'bg-perte-erreur', texte: 'text-perte-erreur' },
  AUTRE: { libelle: 'Autre', court: 'Autre', fond: 'bg-perte-autre', texte: 'text-steel-500' },
  AVOIR_REFUSE: { libelle: 'Avoir fournisseur refusé', court: 'Avoir refusé', fond: 'bg-perte-avoir', texte: 'text-steel-500' },
};

/** Les quatre motifs proposés en grille ; « Autre » en dessous. */
export const MOTIFS_PRINCIPAUX = ['CASSE_MANUTENTION', 'DEGAT_EAUX', 'VOL', 'ERREUR_SAISIE'] as const;

/** « 2026-10 » → « octobre 2026 ». */
export function libelleMois(mois: string, court = false): string {
  return new Date(`${mois}-01T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: court ? 'short' : 'long',
    ...(court ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
}
