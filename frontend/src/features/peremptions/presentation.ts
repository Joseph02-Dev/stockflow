import type { Tranche } from './types';

/** Mêmes bornes que le serveur (lots.service.ts, trancheDe). */
export function trancheDe(jours: number): Tranche {
  if (jours < 0) return 'PERIME';
  if (jours <= 7) return 'MOINS_7';
  if (jours <= 30) return 'DE_8_A_30';
  return 'PLUS_30';
}

export const TRANCHES: Record<Tranche, { libelle: string; filet: string; texte: string; point: string }> = {
  PERIME: {
    libelle: 'Déjà périmé',
    filet: 'border-peremption-perime',
    texte: 'text-rupture',
    point: 'bg-peremption-perime',
  },
  MOINS_7: {
    libelle: 'Moins de 7 jours',
    filet: 'border-peremption-urgent',
    texte: 'text-faible',
    point: 'bg-peremption-urgent',
  },
  DE_8_A_30: {
    libelle: '8 à 30 jours',
    filet: 'border-peremption-proche',
    texte: 'text-peremption-proche-texte',
    point: 'bg-peremption-proche',
  },
  PLUS_30: {
    libelle: 'Plus de 30 jours',
    filet: 'border-peremption-loin',
    texte: 'text-ok',
    point: 'bg-peremption-loin',
  },
};

/** « Périmé depuis 3 j », « Aujourd’hui », « Dans 12 j ». */
export function libelleJours(jours: number): string {
  if (jours < 0) return `Périmé depuis ${-jours} j`;
  if (jours === 0) return 'Aujourd’hui';
  return `Dans ${jours} j`;
}

/**
 * Date de péremption : un jour, stocké à minuit UTC — affiché en UTC pour
 * ne jamais glisser d'un jour selon le fuseau du poste.
 */
export function datePeremption(date: string): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
