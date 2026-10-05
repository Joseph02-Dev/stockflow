import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  CalendarX2,
  PackageX,
  SlidersHorizontal,
  Truck,
  Undo2,
} from 'lucide-react';

export type TypeMouvement =
  | 'ENTREE'
  | 'SORTIE'
  | 'TRANSFERT'
  | 'AJUSTEMENT'
  | 'PERIME'
  | 'CASSE'
  | 'RETOUR_CLIENT'
  | 'RETOUR_FOURNISSEUR';

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
  // Perte d'un lot périmé : distincte d'une sortie commerciale.
  PERIME: { libelle: 'Périmé', Icone: CalendarX2, fond: 'bg-rupture-wash text-rupture', couleur: 'text-rupture' },
  // Pertes et retours.
  CASSE: { libelle: 'Casse', Icone: PackageX, fond: 'bg-rupture-wash text-rupture', couleur: 'text-rupture' },
  RETOUR_CLIENT: { libelle: 'Retour client', Icone: Undo2, fond: 'bg-ok-wash text-ok', couleur: 'text-ok' },
  RETOUR_FOURNISSEUR: { libelle: 'Retour fournisseur', Icone: Truck, fond: 'bg-faible-wash text-faible', couleur: 'text-faible' },
};

/** « +12 », « −5 », « 8 » (transfert : le total ne change pas). */
export function quantiteSignee(type: TypeMouvement, quantite: number): string {
  if (type === 'ENTREE') return `+${quantite}`;
  if (type === 'SORTIE' || type === 'PERIME' || type === 'CASSE' || type === 'RETOUR_FOURNISSEUR') return `−${quantite}`;
  if (type === 'RETOUR_CLIENT') return `+${quantite}`;
  // Un ajustement d'inventaire enregistre l'écart, déjà signé.
  if (type === 'AJUSTEMENT') return quantite > 0 ? `+${quantite}` : `−${Math.abs(quantite)}`;
  return String(quantite);
}
