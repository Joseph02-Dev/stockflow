interface ColonneCsv<T> {
  entete: string;
  valeur: (ligne: T) => string | number;
}

/**
 * Échappe une valeur pour le format CSV : entoure de guillemets si elle
 * contient une virgule, un guillemet ou un retour à la ligne, et double
 * les guillemets internes.
 */
function echapperValeur(valeur: string | number): string {
  const texte = String(valeur);
  if (/[",\n]/.test(texte)) {
    return `"${texte.replace(/"/g, '""')}"`;
  }
  return texte;
}

/**
 * Génère un CSV à partir de colonnes typées et déclenche son
 * téléchargement dans le navigateur. Le BOM UTF-8 en tête de fichier est
 * nécessaire pour qu'Excel affiche correctement les caractères accentués
 * — sans lui, "Ecrou" au lieu de "Écrou" à l'ouverture.
 */
export function exporterCsv<T>(nomFichier: string, colonnes: ColonneCsv<T>[], lignes: T[]): void {
  const enTete = colonnes.map((c) => echapperValeur(c.entete)).join(',');
  const corps = lignes.map((ligne) => colonnes.map((c) => echapperValeur(c.valeur(ligne))).join(','));
  const contenu = [enTete, ...corps].join('\r\n');

  const BOM_UTF8 = '\uFEFF';
  const blob = new Blob([BOM_UTF8 + contenu], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
  URL.revokeObjectURL(url);
}
