import type {
  NatureEmplacement,
  TypeMouvement,
} from '../../generated/prisma/enums.js';

/**
 * Double entrée (inspirée d'Odoo) : tout mouvement va d'une origine vers
 * une destination. INTERNE désigne un emplacement réel ; les autres
 * natures sont des emplacements virtuels (fournisseurs, clients, rebut,
 * écarts d'inventaire, transit), sans stock propre. Règles pures, sans
 * accès base : testées unitairement.
 */
export interface Sens {
  origine: NatureEmplacement;
  destination: NatureEmplacement;
}

/**
 * Sens déduit du seul type — même règle que les fonctions SQL
 * mouvement_*_par_defaut (migration 20261011090000), qui l'appliquent aux
 * INSERT d'une version de l'API antérieure à la double entrée. La
 * quantité d'un AJUSTEMENT est signée : positive = entrée d'inventaire.
 */
export function sensParDefaut(type: TypeMouvement, quantite: number): Sens {
  switch (type) {
    case 'ENTREE':
      return { origine: 'FOURNISSEUR', destination: 'INTERNE' };
    case 'RETOUR_CLIENT':
      return { origine: 'CLIENT', destination: 'INTERNE' };
    case 'SORTIE':
      return { origine: 'INTERNE', destination: 'CLIENT' };
    case 'PERIME':
    case 'CASSE':
      return { origine: 'INTERNE', destination: 'REBUT' };
    case 'RETOUR_FOURNISSEUR':
      return { origine: 'INTERNE', destination: 'FOURNISSEUR' };
    case 'TRANSFERT':
      return { origine: 'INTERNE', destination: 'INTERNE' };
    case 'AJUSTEMENT':
      return quantite >= 0
        ? { origine: 'INVENTAIRE', destination: 'INTERNE' }
        : { origine: 'INTERNE', destination: 'INVENTAIRE' };
  }
}

/** Libellés des emplacements virtuels, pour l'historique et l'API. */
export const LIBELLES_NATURES: Record<NatureEmplacement, string> = {
  INTERNE: 'Emplacement',
  FOURNISSEUR: 'Fournisseurs',
  CLIENT: 'Clients',
  REBUT: 'Rebut',
  INVENTAIRE: 'Écarts d’inventaire',
  TRANSIT: 'En transit',
};

export interface Extremite {
  nature: NatureEmplacement;
  /** Renseigné seulement pour la nature INTERNE. */
  emplacementId: string | null;
}

/**
 * Les deux extrémités d'un mouvement enregistré. Le côté INTERNE est
 * emplacementId, sauf la destination d'un transfert
 * (emplacementDestinationId).
 */
export function extremites(m: {
  origine: NatureEmplacement;
  destination: NatureEmplacement;
  emplacementId: string;
  emplacementDestinationId: string | null;
}): { source: Extremite; destination: Extremite } {
  const transfert = m.origine === 'INTERNE' && m.destination === 'INTERNE';
  return {
    source: {
      nature: m.origine,
      emplacementId: m.origine === 'INTERNE' ? m.emplacementId : null,
    },
    destination: {
      nature: m.destination,
      emplacementId:
        m.destination !== 'INTERNE'
          ? null
          : transfert
            ? m.emplacementDestinationId
            : m.emplacementId,
    },
  };
}
