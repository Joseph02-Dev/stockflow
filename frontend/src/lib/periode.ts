/** Début (minuit, heure locale) d'une période de `jours` jours finissant aujourd'hui, en ISO. */
export function debutPeriode(jours: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (jours - 1));
  return d.toISOString();
}

const JOUR_MS = 86_400_000;

/** Jours calendaires entre deux instants (minuit local à minuit local). */
export function joursEntre(debut: Date, fin: Date): number {
  const a = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate()).getTime();
  const b = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate()).getTime();
  return Math.round((b - a) / JOUR_MS);
}
