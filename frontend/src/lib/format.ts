const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const relatif = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

/** 1284760000 → « 1 284 760 000 » (espaces fines insécables, usage français). */
export function formatNombre(valeur: number): string {
  return nombre.format(valeur);
}

/** « il y a 3 h », « hier », « il y a 4 jours »… */
export function tempsRelatif(date: string | Date, maintenant: number): string {
  const ecartSecondes = Math.round((new Date(date).getTime() - maintenant) / 1000);
  const abs = Math.abs(ecartSecondes);
  if (abs < 60) return 'à l’instant';
  if (abs < 3600) return relatif.format(Math.round(ecartSecondes / 60), 'minute');
  if (abs < 86400) return relatif.format(Math.round(ecartSecondes / 3600), 'hour');
  return relatif.format(Math.round(ecartSecondes / 86400), 'day');
}

/** Accord simple : pluriel('référence', 3) → « références ». */
export function pluriel(mot: string, n: number, formePlurielle = `${mot}s`): string {
  return Math.abs(n) > 1 ? formePlurielle : mot;
}

const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

/** Nombre abrégé pour les axes et totaux de graphiques : « 1,4 M », « 250 k ». */
export function formatCompact(valeur: number): string {
  return compact.format(valeur);
}
