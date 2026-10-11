/** Types et règles d'affichage des modèles à variantes (miroir de l'API /modeles). */
export interface AttributModele {
  nom: string;
  valeurs: string[];
}

export interface VarianteModele {
  id: string;
  nom: string;
  reference: string | null;
  valeursVariante: Record<string, string> | null;
  prixVente: number | null;
  archive: boolean;
  stock: number;
}

export interface Modele {
  id: string;
  nom: string;
  reference: string | null;
  prixAchat: number | null;
  prixVente: number | null;
  archive: boolean;
  attributs: AttributModele[];
  variantes?: VarianteModele[];
  _count?: { variantes: number };
}

/** « Rouge, Bleu ,  Vert » → ['Rouge', 'Bleu', 'Vert'] (doublons retirés). */
export function lireValeurs(texte: string): string[] {
  const vus = new Set<string>();
  return texte
    .split(',')
    .map((v) => v.trim().replace(/\s+/g, ' '))
    .filter((v) => v !== '' && !vus.has(v.toLowerCase()) && vus.add(v.toLowerCase()));
}

/** Nombre de variantes de la grille (0 tant qu'un attribut est vide). */
export function tailleGrille(attributs: AttributModele[]): number {
  if (attributs.length === 0) return 0;
  return attributs.reduce((n, a) => n * a.valeurs.length, 1);
}
