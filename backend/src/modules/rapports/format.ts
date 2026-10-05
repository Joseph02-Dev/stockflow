/**
 * Formateurs des rapports, écrits à la main : ni toLocaleString ni Intl.
 * Node peut tourner sans ICU complet (Railway) et le formatage différerait
 * alors silencieusement entre le poste du développeur et la production.
 *
 * Dates en UTC : la Guinée est à UTC+0 toute l'année, sans heure d'été.
 */

/** Espace insécable fine (U+202F), séparateur des milliers en français. */
export const ESPACE_FINE_INSECABLE = ' ';
/**
 * Espace fine (U+2009) pour le PDF : la police Roboto livrée avec pdfmake
 * n'a pas de glyphe U+202F. Les cellules de montants sont en noWrap, la
 * fine n'y est donc jamais une occasion de retour à la ligne.
 */
export const ESPACE_FINE_PDF = ' ';
const ESPACE_INSECABLE = ' ';

/** 1284760000 → « 1 284 760 000 » ; négatifs avec le signe moins (U+2212). */
export function formaterMontant(
  valeur: number,
  separateur: string = ESPACE_FINE_INSECABLE,
): string {
  if (!Number.isFinite(valeur)) return '—';
  const entier = Math.round(valeur);
  const chiffres = String(Math.abs(entier));
  let resultat = '';
  for (let i = 0; i < chiffres.length; i++) {
    if (i > 0 && (chiffres.length - i) % 3 === 0) resultat += separateur;
    resultat += chiffres[i];
  }
  return entier < 0 ? `−${resultat}` : resultat;
}

/** Quantité signée : « +12 », « −3 », « 0 ». */
export function formaterQuantiteSignee(
  valeur: number,
  separateur: string = ESPACE_FINE_INSECABLE,
): string {
  if (valeur > 0) return `+${formaterMontant(valeur, separateur)}`;
  return formaterMontant(valeur, separateur);
}

/** 46.25 → « 46,3 % » ; 46 → « 46 % » (une décimale au plus, virgule). */
export function formaterPourcentage(valeur: number, decimales = 1): string {
  if (!Number.isFinite(valeur)) return '—';
  const facteur = 10 ** decimales;
  const arrondi = Math.round(valeur * facteur) / facteur;
  const [entier, fraction] = Math.abs(arrondi).toFixed(decimales).split('.');
  const texte =
    fraction && Number(fraction) !== 0
      ? `${formaterMontant(Number(entier))},${fraction.replace(/0+$/, '')}`
      : formaterMontant(Number(entier));
  return `${arrondi < 0 ? '−' : ''}${texte}${ESPACE_INSECABLE}%`;
}

const deux = (n: number) => String(n).padStart(2, '0');

/** « 11/09/2026 » */
export function formaterDate(date: Date): string {
  return `${deux(date.getUTCDate())}/${deux(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/** « 11/09/2026 à 16:42 » */
export function formaterDateHeure(date: Date): string {
  return `${formaterDate(date)} à ${deux(date.getUTCHours())}:${deux(date.getUTCMinutes())}`;
}

/** « 11/09 » : date courte des lignes de relevé. */
export function formaterJourMois(date: Date): string {
  return `${deux(date.getUTCDate())}/${deux(date.getUTCMonth() + 1)}`;
}

/** Période lisible : « du 01/07/2026 au 30/09/2026 ». */
export function formaterPeriode(debut: Date, fin: Date): string {
  return `du ${formaterDate(debut)} au ${formaterDate(fin)}`;
}

/** « 2026-10-06 » (AAAA-MM-JJ, UTC) : noms de fichiers. */
export function dateIso(date: Date): string {
  return `${date.getUTCFullYear()}-${deux(date.getUTCMonth() + 1)}-${deux(date.getUTCDate())}`;
}
