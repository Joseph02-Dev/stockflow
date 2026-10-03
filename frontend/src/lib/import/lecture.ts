import Papa from 'papaparse';

/**
 * Lecture d'un fichier importé, entièrement dans le navigateur : le
 * fichier n'est jamais téléversé. Ces fonctions sont pures (pas de DOM)
 * et testées depuis le backend.
 */

export type Encodage = 'utf-8' | 'windows-1252' | 'utf-16le' | 'utf-16be';
export type Separateur = ',' | ';' | '\t';

export interface TableauLu {
  entetes: string[];
  /** Lignes non vides, avec leur numéro dans le fichier (en-tête = 1). */
  lignes: { numero: number; cellules: string[] }[];
}

/**
 * Encodage : BOM s'il y en a un ; sinon UTF-8, et Windows-1252 si le
 * décodage UTF-8 produit des caractères de remplacement (CSV enregistré
 * par Excel sous Windows : « Réserve » resterait « R�serve »).
 */
export function decoderTexte(octets: Uint8Array): { texte: string; encodage: Encodage } {
  if (octets[0] === 0xef && octets[1] === 0xbb && octets[2] === 0xbf) {
    return { texte: new TextDecoder('utf-8').decode(octets.subarray(3)), encodage: 'utf-8' };
  }
  if (octets[0] === 0xff && octets[1] === 0xfe) {
    return { texte: new TextDecoder('utf-16le').decode(octets.subarray(2)), encodage: 'utf-16le' };
  }
  if (octets[0] === 0xfe && octets[1] === 0xff) {
    return { texte: new TextDecoder('utf-16be').decode(octets.subarray(2)), encodage: 'utf-16be' };
  }
  const utf8 = new TextDecoder('utf-8').decode(octets);
  if (!utf8.includes('�')) return { texte: utf8, encodage: 'utf-8' };
  return { texte: decoderWindows1252(octets), encodage: 'windows-1252' };
}

/**
 * Windows-1252 : Latin-1, sauf la plage 0x80–0x9F (’ € œ « … ). Décodé
 * par table plutôt que par TextDecoder, dont certaines implémentations
 * (Node) traitent ce libellé comme du Latin-1 pur.
 */
const PLAGE_80_9F =
  '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f' +
  '\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178';

export function decoderWindows1252(octets: Uint8Array): string {
  let texte = '';
  for (const octet of octets) {
    texte += octet >= 0x80 && octet <= 0x9f ? PLAGE_80_9F[octet - 0x80] : String.fromCharCode(octet);
  }
  return texte;
}

const CANDIDATS: Separateur[] = [';', ',', '\t'];

/**
 * Séparateur : celui qui donne, sur les premières lignes, le plus de
 * colonnes de façon cohérente (même nombre sur presque toutes les lignes).
 * Excel en configuration française exporte avec « ; ».
 */
export function detecterSeparateur(texte: string): Separateur {
  let meilleur: Separateur = ',';
  let meilleurScore = 0;
  for (const separateur of CANDIDATS) {
    const { data } = Papa.parse<string[]>(texte, { delimiter: separateur, preview: 20 });
    const comptes = data.filter((ligne) => ligne.some((c) => c.trim() !== '')).map((ligne) => ligne.length);
    if (comptes.length === 0) continue;
    const frequences = new Map<number, number>();
    for (const n of comptes) frequences.set(n, (frequences.get(n) ?? 0) + 1);
    const [mode, effectif] = [...frequences.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const coherence = effectif / comptes.length;
    const score = mode > 1 ? mode * coherence : 0;
    if (score > meilleurScore) {
      meilleur = separateur;
      meilleurScore = score;
    }
  }
  return meilleur;
}

/** Cellules débarrassées des espaces de début et de fin (insécables compris). */
export function nettoyer(valeur: string): string {
  return valeur.replace(/^[\s  ]+|[\s  ]+$/g, '');
}

/**
 * Tableau à partir des lignes brutes : première ligne non vide = en-têtes,
 * lignes entièrement vides ignorées sans bruit (fréquent en fin de
 * fichier Excel).
 */
export function tableauDepuisLignes(brutes: string[][]): TableauLu {
  const debut = brutes.findIndex((l) => l.some((c) => nettoyer(c) !== ''));
  if (debut === -1) return { entetes: [], lignes: [] };
  const entetes = brutes[debut].map(nettoyer);
  const lignes = brutes
    .slice(debut + 1)
    .map((cellules, i) => ({ numero: debut + i + 2, cellules: cellules.map(nettoyer) }))
    .filter((l) => l.cellules.some((c) => c !== ''));
  return { entetes, lignes };
}

/** CSV : encodage et séparateur détectés, puis tableau. */
export function lireCsv(octets: Uint8Array): TableauLu & { encodage: Encodage; separateur: Separateur } {
  const { texte, encodage } = decoderTexte(octets);
  const separateur = detecterSeparateur(texte);
  const { data } = Papa.parse<string[]>(texte, { delimiter: separateur, skipEmptyLines: false });
  return { ...tableauDepuisLignes(data), encodage, separateur };
}

/** Cellule Excel → texte : dates en AAAA-MM-JJ (format accepté par le serveur). */
export function celluleEnTexte(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  if (valeur instanceof Date) return valeur.toISOString().slice(0, 10);
  return String(valeur);
}
