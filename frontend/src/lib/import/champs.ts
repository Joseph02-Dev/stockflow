/**
 * Champs StockFlow qu'une colonne importée peut alimenter (mêmes clés que
 * le serveur : backend/src/modules/import/normalisation.ts) et
 * reconnaissance automatique des en-têtes réels.
 */
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

export const LIBELLES_CHAMPS: Record<ChampImport, string> = {
  nom: 'Nom du produit',
  reference: 'Référence',
  codeBarre: 'Code-barre',
  categorie: 'Catégorie',
  marque: 'Marque',
  uniteMesure: 'Unité de mesure',
  prixAchat: 'Prix d’achat',
  prixVente: 'Prix de vente (détail)',
  prixDemiGros: 'Prix demi-gros',
  prixGros: 'Prix gros',
  tauxTva: 'TVA (%)',
  seuilAlerte: 'Seuil d’alerte',
  quantite: 'Quantité initiale',
  numeroLot: 'Numéro de lot',
  datePeremption: 'Date de péremption',
  description: 'Description',
};

/** Variantes rencontrées dans les fichiers réels (français, anglais, abréviations). */
const SYNONYMES: Record<ChampImport, string[]> = {
  nom: ['nom', 'nom du produit', 'nom produit', 'designation', 'désignation', 'libelle', 'libellé', 'produit', 'article', 'intitule', 'intitulé', 'name', 'product', 'product name', 'item'],
  reference: ['reference', 'référence', 'ref', 'réf', 'code', 'code article', 'code produit', 'sku', 'référence interne'],
  codeBarre: ['code barre', 'code-barre', 'code barres', 'codebarre', 'ean', 'ean13', 'gtin', 'upc', 'barcode'],
  categorie: ['categorie', 'catégorie', 'famille', 'rayon', 'groupe', 'category'],
  marque: ['marque', 'fabricant', 'brand'],
  uniteMesure: ['unite', 'unité', 'unite de mesure', 'unité de mesure', 'um', 'conditionnement', 'unit'],
  prixAchat: ['prix achat', "prix d'achat", 'prix d’achat', 'prix_achat', 'pa', 'cout', 'coût', 'cout achat', 'coût d’achat', 'prix de revient', 'purchase price', 'purchase_price', 'cost'],
  prixVente: ['prix vente', 'prix de vente', 'prix_vente', 'pv', 'prix', 'prix detail', 'prix de détail', 'prix unitaire', 'pu', 'price', 'sale price', 'selling price'],
  prixDemiGros: ['prix demi gros', 'prix demi-gros', 'demi gros', 'demi-gros', 'prix_demi_gros'],
  prixGros: ['prix gros', 'prix de gros', 'prix_gros', 'gros', 'wholesale', 'wholesale price'],
  tauxTva: ['tva', 'tva (%)', 'taux tva', 'taux de tva', 'vat', 'tax'],
  seuilAlerte: ['seuil', 'seuil alerte', 'seuil d’alerte', "seuil d'alerte", 'stock minimum', 'stock min', 'minimum', 'alerte', 'reorder point'],
  quantite: ['quantite', 'quantité', 'quantité initiale', 'quantite initiale', 'qte', 'qté', 'stock', 'stock initial', 'stock actuel', 'qty', 'quantity'],
  numeroLot: ['lot', 'numero lot', 'numéro de lot', 'n° lot', 'num lot', 'batch', 'lot number'],
  datePeremption: ['date peremption', 'date de péremption', 'péremption', 'peremption', 'dlc', 'dluo', 'ddm', 'expiration', 'date expiration', 'expiry', 'expiry date', 'best before'],
  description: ['description', 'desc', 'details', 'détails', 'commentaire', 'observation', 'observations'],
};

/** « Prix d'achat », « PRIX_ACHAT », « prix-achat » → « prixdachat » / « prixachat ». */
export function cleEntete(entete: string): string {
  return entete
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const PAR_CLE = new Map<string, ChampImport>();
for (const champ of CHAMPS_IMPORT) {
  for (const synonyme of [...SYNONYMES[champ], LIBELLES_CHAMPS[champ]]) {
    if (!PAR_CLE.has(cleEntete(synonyme))) PAR_CLE.set(cleEntete(synonyme), champ);
  }
}

/** Champ reconnu pour un en-tête, ou null. */
export function reconnaitreEntete(entete: string): ChampImport | null {
  return PAR_CLE.get(cleEntete(entete)) ?? null;
}

/**
 * Correspondance proposée pour toutes les colonnes : chaque champ n'est
 * attribué qu'une fois (la première colonne reconnue l'emporte).
 */
export function proposerCorrespondance(entetes: string[]): (ChampImport | null)[] {
  const pris = new Set<ChampImport>();
  return entetes.map((entete) => {
    const champ = reconnaitreEntete(entete);
    if (!champ || pris.has(champ)) return null;
    pris.add(champ);
    return champ;
  });
}
