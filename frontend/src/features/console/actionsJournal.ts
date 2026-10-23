import { Eye, Lock, LockOpen, LogIn, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ActionAudit } from './types';

export interface EntreeJournal {
  id: string;
  action: ActionAudit;
  motif: string | null;
  detail: string | null;
  createdAt: string;
  operateur: { id: string; nom: string; email: string };
  entreprise: { id: string; nom: string | null } | null;
}

/**
 * Présentation de chaque action du journal, partagée par l'écran Journal
 * et la vue d'ensemble. Verbes au passé composé avec « avoir » : aucun
 * accord de genre à deviner.
 */
export const ACTIONS_JOURNAL: Record<ActionAudit, { libelle: string; filtre: string; verbe: string; Icone: LucideIcon; couleur: string }> = {
  CONNEXION: { libelle: 'Connexion', filtre: 'Connexions', verbe: 'a ouvert une session', Icone: LogIn, couleur: 'var(--color-steel-500)' },
  CONSULTATION_ENTREPRISE: { libelle: 'Consultation', filtre: 'Consultations', verbe: 'a consulté', Icone: Eye, couleur: 'var(--color-steel-700)' },
  SUSPENSION: { libelle: 'Suspension', filtre: 'Suspensions', verbe: 'a suspendu l’accès de', Icone: Lock, couleur: 'var(--color-rupture)' },
  RETABLISSEMENT: { libelle: 'Rétablissement', filtre: 'Rétablissements', verbe: 'a rétabli l’accès de', Icone: LockOpen, couleur: 'var(--color-ok)' },
  MODIFICATION_REGLAGES: {
    libelle: 'Réglages',
    filtre: 'Réglages',
    verbe: 'a modifié les réglages de',
    Icone: SlidersHorizontal,
    couleur: 'var(--color-action)',
  },
};
