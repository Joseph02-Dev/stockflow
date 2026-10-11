/**
 * Double entrée : un mouvement va d'une origine vers une destination.
 * INTERNE = un emplacement réel ; les autres sont des emplacements
 * virtuels (mêmes libellés que LIBELLES_NATURES côté serveur).
 */
export type NatureEmplacement = 'INTERNE' | 'FOURNISSEUR' | 'CLIENT' | 'REBUT' | 'INVENTAIRE' | 'TRANSIT';

export const LIBELLES_NATURES: Record<NatureEmplacement, string> = {
  INTERNE: 'Emplacement',
  FOURNISSEUR: 'Fournisseurs',
  CLIENT: 'Clients',
  REBUT: 'Rebut',
  INVENTAIRE: 'Écarts d’inventaire',
  TRANSIT: 'En transit',
};

/** « Fournisseurs → Madina », « Madina → Coyah », « Madina → Clients ». */
export function trajetMouvement(m: {
  origine?: NatureEmplacement;
  destination?: NatureEmplacement;
  emplacement: { nom: string };
  emplacementDestination: { nom: string } | null;
}): string {
  // Réponse d'une version de l'API antérieure à la double entrée.
  if (!m.origine || !m.destination) {
    return m.emplacementDestination ? `${m.emplacement.nom} → ${m.emplacementDestination.nom}` : m.emplacement.nom;
  }
  const source = m.origine === 'INTERNE' ? m.emplacement.nom : LIBELLES_NATURES[m.origine];
  const destination =
    m.destination !== 'INTERNE'
      ? LIBELLES_NATURES[m.destination]
      : (m.emplacementDestination?.nom ?? m.emplacement.nom);
  return `${source} → ${destination}`;
}
