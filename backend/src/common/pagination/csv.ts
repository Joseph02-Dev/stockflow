/**
 * CSV identique à l'export du frontend (lib/exporterCsv.ts) : séparateur
 * virgule, fins de ligne CRLF, BOM UTF-8 pour qu'Excel affiche les accents.
 */
export const BOM_UTF8 = '﻿';

/** Séparateur « ; » : celui qu'attend Excel en configuration française. */
export function ligneCsv(
  valeurs: (string | number)[],
  separateur: ',' | ';' = ',',
): string {
  return (
    valeurs
      .map((valeur) => {
        const texte = String(valeur);
        return /["\n]/.test(texte) || texte.includes(separateur)
          ? `"${texte.replace(/"/g, '""')}"`
          : texte;
      })
      .join(separateur) + '\r\n'
  );
}
