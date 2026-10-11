/**
 * Règle min/max (orderpoint d'Odoo), pure et testée unitairement.
 *
 * Stock prévisionnel = en stock + commandes fournisseur en cours
 * (brouillons compris : un brouillon déjà généré n'est jamais recommandé).
 * Sous le minimum, on remonte au maximum, arrondi au multiple supérieur
 * (cartons de 12…). Au minimum ou au-dessus : rien à commander.
 */
export function quantiteACommander(previsionnel: number, min: number, max: number, multiple = 1): number {
  if (previsionnel >= min) return 0;
  const besoin = max - previsionnel;
  return Math.ceil(besoin / multiple) * multiple;
}

/** Fournisseur d'une règle : le sien, sinon l'unique fournisseur associé au produit. */
export function fournisseurRetenu(fournisseurRegle: string | null, associes: string[]): string | null {
  if (fournisseurRegle) return fournisseurRegle;
  return associes.length === 1 ? associes[0] : null;
}

/**
 * Pour un emplacement, lui-même et tous ses descendants (arborescence).
 * Robuste à un cycle éventuel ; résultats mis en cache.
 */
export function sousEmplacements(emplacements: { id: string; parentId: string | null }[]) {
  const enfants = new Map<string, string[]>();
  for (const e of emplacements) {
    if (e.parentId) enfants.set(e.parentId, [...(enfants.get(e.parentId) ?? []), e.id]);
  }
  const cache = new Map<string, Set<string>>();
  return (racine: string): Set<string> => {
    const connu = cache.get(racine);
    if (connu) return connu;
    const vus = new Set<string>([racine]);
    const pile = [racine];
    while (pile.length > 0) {
      for (const enfant of enfants.get(pile.pop()!) ?? []) {
        if (!vus.has(enfant)) {
          vus.add(enfant);
          pile.push(enfant);
        }
      }
    }
    cache.set(racine, vus);
    return vus;
  };
}
