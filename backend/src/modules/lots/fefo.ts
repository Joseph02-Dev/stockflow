/**
 * Règles pures du suivi par lot : ordre FEFO (First Expired, First Out),
 * répartition d'une sortie entre lots et calcul des jours restants.
 * Sans accès base : testées unitairement.
 */

export interface LotFefo {
  id: string;
  numero: string;
  quantite: number;
  datePeremption: Date | null;
  recuAt: Date;
}

const JOUR_MS = 86_400_000;

/**
 * Ordre FEFO : péremption la plus proche d'abord, lots sans date en
 * dernier, puis réception la plus ancienne (numéro en dernier recours,
 * pour un ordre toujours déterministe).
 */
export function comparerFefo(a: LotFefo, b: LotFefo): number {
  const da = a.datePeremption?.getTime() ?? Number.POSITIVE_INFINITY;
  const db = b.datePeremption?.getTime() ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da < db ? -1 : 1;
  if (a.recuAt.getTime() !== b.recuAt.getTime()) {
    return a.recuAt.getTime() - b.recuAt.getTime();
  }
  return a.numero.localeCompare(b.numero);
}

/**
 * Répartit une sortie entre les lots, dans l'ordre FEFO. Renvoie null si
 * l'ensemble des lots ne suffit pas : rien ne doit alors être écrit.
 */
export function repartirFefo<L extends LotFefo>(
  lots: L[],
  quantite: number,
): { lot: L; quantite: number }[] | null {
  const plan: { lot: L; quantite: number }[] = [];
  let reste = quantite;
  for (const lot of [...lots].sort(comparerFefo)) {
    if (reste === 0) break;
    if (lot.quantite <= 0) continue;
    const prise = Math.min(lot.quantite, reste);
    plan.push({ lot, quantite: prise });
    reste -= prise;
  }
  return reste === 0 ? plan : null;
}

/** Minuit UTC du jour donné (la Guinée vit à UTC+0, sans heure d'été). */
export function debutJour(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Jours entre aujourd'hui et la péremption : négatif = déjà périmé. */
export function joursRestants(datePeremption: Date, maintenant: Date): number {
  return Math.round(
    (debutJour(datePeremption).getTime() - debutJour(maintenant).getTime()) /
      JOUR_MS,
  );
}

/** « 2027-01-04 » → minuit UTC de ce jour. */
export function lireDatePeremption(valeur: string): Date {
  return new Date(`${valeur}T00:00:00.000Z`);
}
