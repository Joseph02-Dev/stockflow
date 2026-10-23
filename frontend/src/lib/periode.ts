/** Début (minuit, heure locale) d'une période de `jours` jours finissant aujourd'hui, en ISO. */
export function debutPeriode(jours: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (jours - 1));
  return d.toISOString();
}
