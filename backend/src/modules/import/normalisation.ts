/**
 * Lecture des valeurs brutes d'un fichier importé (règles pures, testées).
 * Le navigateur envoie les cellules telles quelles : c'est ici, côté
 * serveur, que chaque valeur est interprétée et validée.
 */

/** Champs StockFlow qu'une colonne du fichier peut alimenter. */
export const CHAMPS_IMPORT = [
  'nom',
  'reference',
  'codeBarre',
  'categorie',
  'marque',
  'uniteMesure',
  'prixAchat',
  'prixVente',
  'prixDemiGros',
  'prixGros',
  'tauxTva',
  'seuilAlerte',
  'quantite',
  'numeroLot',
  'datePeremption',
  'description',
] as const;
export type ChampImport = (typeof CHAMPS_IMPORT)[number];

/** En-têtes des modèles CSV, dans l'ordre de CHAMPS_IMPORT. */
export const ENTETES_MODELE: Record<ChampImport, string> = {
  nom: 'Nom du produit',
  reference: 'Référence',
  codeBarre: 'Code-barre',
  categorie: 'Catégorie',
  marque: 'Marque',
  uniteMesure: 'Unité',
  prixAchat: 'Prix d’achat',
  prixVente: 'Prix de vente',
  prixDemiGros: 'Prix demi-gros',
  prixGros: 'Prix gros',
  tauxTva: 'TVA (%)',
  seuilAlerte: 'Seuil d’alerte',
  quantite: 'Quantité initiale',
  numeroLot: 'Numéro de lot',
  datePeremption: 'Date de péremption',
  description: 'Description',
};

/** Espaces de début et de fin retirés (insécables compris) ; vide = null. */
export function lireTexte(valeur: string | undefined | null): string | null {
  const texte = (valeur ?? '').replace(
    /^[\s\u00a0\u202f]+|[\s\u00a0\u202f]+$/g,
    '',
  );
  return texte === '' ? null : texte;
}

/**
 * Montant ou quantité : 72000, 72 000, 72 000 (insécable), 72,000 et
 * 72.000 donnent tous 72000. Tout ce qui n'est pas un chiffre est retiré,
 * puis la valeur est convertie en entier — jamais de flottant.
 * Renvoie null pour une cellule vide, 'illisible' sans aucun chiffre.
 */
export function lireEntier(
  valeur: string | undefined | null,
): number | null | 'illisible' {
  const texte = lireTexte(valeur);
  if (texte === null) return null;
  const chiffres = texte.replace(/\D/g, '');
  if (chiffres === '') return 'illisible';
  const nombre = Number.parseInt(chiffres, 10);
  return Number.isSafeInteger(nombre) ? nombre : 'illisible';
}

export interface DateLue {
  /** AAAA-MM-JJ */
  iso: string;
  /** Jour et mois interchangeables (03/04/2027) : lu au format français. */
  ambigue: boolean;
}

/**
 * Dates acceptées : jj/mm/aaaa, jj-mm-aaaa et aaaa-mm-jj (jour et mois sur
 * un ou deux chiffres). En cas d'ambiguïté jour/mois, le format français
 * l'emporte et la date est signalée. null pour une cellule vide,
 * 'illisible' pour une date impossible ou dans un autre format.
 */
export function lireDate(
  valeur: string | undefined | null,
): DateLue | null | 'illisible' {
  const texte = lireTexte(valeur);
  if (texte === null) return null;
  let jour: number, mois: number, annee: number;
  let ambigue = false;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texte);
  const francaise = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texte);
  if (iso) {
    [annee, mois, jour] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (francaise) {
    [jour, mois, annee] = [
      Number(francaise[1]),
      Number(francaise[2]),
      Number(francaise[3]),
    ];
    ambigue = jour <= 12 && mois <= 12 && jour !== mois;
  } else {
    return 'illisible';
  }
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  if (
    date.getUTCFullYear() !== annee ||
    date.getUTCMonth() !== mois - 1 ||
    date.getUTCDate() !== jour
  ) {
    return 'illisible';
  }
  return { iso: date.toISOString().slice(0, 10), ambigue };
}

/** Clé de comparaison d'un nom : casse et accents ignorés (« Materiaux » = « Matériaux »). */
export function cleNom(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/\s+/g, ' ')
    .trim();
}

/** « 420 000 » */
export function montant(valeur: number): string {
  return new Intl.NumberFormat('fr-FR').format(valeur).replace(/\u202f/g, ' ');
}
