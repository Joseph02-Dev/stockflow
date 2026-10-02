import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, SlidersHorizontal } from 'lucide-react';

export type TypeMouvement = 'ENTREE' | 'SORTIE' | 'TRANSFERT' | 'AJUSTEMENT';

/**
 * Grammaire d'un mouvement : marqueur carré (fond -wash + icône), libellé
 * et quantité signée. Le type n'est jamais porté par la couleur seule.
 */
export const presentationMouvement: Record<
  TypeMouvement,
  { libelle: string; Icone: typeof ArrowDownToLine; fond: string; couleur: string }
> = {
  ENTREE: { libelle: 'Entrée', Icone: ArrowDownToLine, fond: 'bg-ok-wash text-ok', couleur: 'text-ok' },
  SORTIE: { libelle: 'Sortie', Icone: ArrowUpFromLine, fond: 'bg-faible-wash text-faible', couleur: 'text-faible' },
  TRANSFERT: { libelle: 'Transfert', Icone: ArrowRightLeft, fond: 'bg-action-wash text-action', couleur: 'text-action' },
  AJUSTEMENT: {
    libelle: 'Ajustement',
    Icone: SlidersHorizontal,
    fond: 'bg-accent-wash text-accent',
    couleur: 'text-accent',
  },
};

/** « +12 », « −5 », « 8 » (transfert : le total ne change pas). */
export function quantiteSignee(type: TypeMouvement, quantite: number): string {
  if (type === 'ENTREE') return `+${quantite}`;
  if (type === 'SORTIE') return `−${quantite}`;
  // Un ajustement d'inventaire enregistre l'écart, déjà signé.
  if (type === 'AJUSTEMENT') return quantite > 0 ? `+${quantite}` : `−${Math.abs(quantite)}`;
  return String(quantite);
}
