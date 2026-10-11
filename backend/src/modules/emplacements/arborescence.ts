/**
 * Règles pures de l'arborescence des emplacements (Dépôt > Zone > Allée…).
 * Sans accès base : testées unitairement.
 */
export interface NoeudEmplacement {
  id: string;
  nom: string;
  parentId: string | null;
}

export const SEPARATEUR_CHEMIN = ' / ';

/** « Dépôt Madina / Zone A / Allée 3 » — robuste à un cycle éventuel en base. */
export function cheminComplet(id: string, parId: Map<string, NoeudEmplacement>): string {
  const noms: string[] = [];
  const vus = new Set<string>();
  let courant = parId.get(id);
  while (courant && !vus.has(courant.id)) {
    vus.add(courant.id);
    noms.unshift(courant.nom);
    courant = courant.parentId ? parId.get(courant.parentId) : undefined;
  }
  return noms.join(SEPARATEUR_CHEMIN);
}

/** Vrai si rattacher `id` sous `parentId` créerait une boucle. */
export function creeraitUnCycle(id: string, parentId: string, parId: Map<string, NoeudEmplacement>): boolean {
  const vus = new Set<string>();
  let courant: string | null = parentId;
  while (courant && !vus.has(courant)) {
    if (courant === id) return true;
    vus.add(courant);
    courant = parId.get(courant)?.parentId ?? null;
  }
  return false;
}
