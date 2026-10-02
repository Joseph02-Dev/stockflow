export type CategorieTarifaire = 'GROS' | 'DEMI_GROS' | 'DETAIL';

export interface Client {
  id: string;
  nom: string;
  telephone: string | null;
  nomCommerce: string | null;
  categorie: CategorieTarifaire;
  plafondCredit: number | null;
  archive: boolean;
  createdAt: string;
}

export const LIBELLES_CATEGORIE: Record<CategorieTarifaire, string> = {
  GROS: 'Gros',
  DEMI_GROS: 'Demi-gros',
  DETAIL: 'Détail',
};

/** Même règle que le backend : « + », indicatif, chiffres, espaces ou tirets. */
export const FORMAT_TELEPHONE = /^\+\d[\d\s-]{6,18}\d$/;
