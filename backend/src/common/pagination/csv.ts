/**
 * CSV identique à l'export du frontend (lib/exporterCsv.ts) : séparateur
 * virgule, fins de ligne CRLF, BOM UTF-8 pour qu'Excel affiche les accents.
 */
export const BOM_UTF8 = '﻿';

/**
 * Injection de formules (OWASP « CSV Injection ») : une cellule texte qui
 * commence par = + - @, une tabulation ou un retour chariot serait
 * exécutée par Excel ou LibreOffice (ex. un nom de produit
 * « =HYPERLINK(...) » saisi par un utilisateur). Préfixée d'une apostrophe,
 * elle s'affiche comme du texte. Les nombres ne sont jamais modifiés.
 */
export function neutraliserFormule(valeur: string | number): string | number {
  return typeof valeur === 'string' && /^[=+\-@\t\r]/.test(valeur) ? `'${valeur}` : valeur;
}

/** Séparateur « ; » : celui qu'attend Excel en configuration française. */
export function ligneCsv(
  valeurs: (string | number)[],
  separateur: ',' | ';' = ',',
): string {
  return (
    valeurs
      .map((valeur) => {
        const texte = String(neutraliserFormule(valeur));
        return /["\n]/.test(texte) || texte.includes(separateur)
          ? `"${texte.replace(/"/g, '""')}"`
          : texte;
      })
      .join(separateur) + '\r\n'
  );
}
