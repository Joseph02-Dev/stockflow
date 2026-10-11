import type { StrategieSortie } from '../../generated/prisma/enums.js';
import { comparerFefo, type LotFefo } from './fefo.js';

/**
 * Stratégies de sortie (removal strategies d'Odoo) : l'ordre dans lequel
 * une sortie automatique prélève les lots. Règles pures, testées
 * unitairement.
 *
 * - FEFO : péremption la plus proche d'abord (lots sans date en dernier) ;
 * - FIFO : réception la plus ancienne d'abord ;
 * - LIFO : réception la plus récente d'abord.
 *
 * Le numéro départage toujours : l'ordre est déterministe.
 */
export function comparateurLots(strategie: StrategieSortie): (a: LotFefo, b: LotFefo) => number {
  if (strategie === 'FEFO') return comparerFefo;
  const sens = strategie === 'FIFO' ? 1 : -1;
  return (a, b) => sens * (a.recuAt.getTime() - b.recuAt.getTime()) || a.numero.localeCompare(b.numero);
}

/**
 * Répartit une sortie entre les lots selon la stratégie. Renvoie null si
 * l'ensemble des lots ne suffit pas : rien ne doit alors être écrit.
 */
export function repartirLots<L extends LotFefo>(
  lots: L[],
  quantite: number,
  strategie: StrategieSortie,
): { lot: L; quantite: number }[] | null {
  const plan: { lot: L; quantite: number }[] = [];
  let reste = quantite;
  for (const lot of [...lots].sort(comparateurLots(strategie))) {
    if (reste === 0) break;
    if (lot.quantite <= 0) continue;
    const prise = Math.min(lot.quantite, reste);
    plan.push({ lot, quantite: prise });
    reste -= prise;
  }
  return reste === 0 ? plan : null;
}

/** Stratégie effective : celle de l'emplacement, sinon celle de l'entreprise ; FEFO sans le module. */
export function strategieEffective(
  moduleActif: boolean,
  strategieEntreprise: StrategieSortie,
  strategieEmplacement: StrategieSortie | null,
): StrategieSortie {
  if (!moduleActif) return 'FEFO';
  return strategieEmplacement ?? strategieEntreprise;
}

/**
 * Numéros de série saisis : espaces retirés, ni vide ni doublon (sans
 * tenir compte de la casse). Renvoie le motif du refus, ou null.
 */
export function refusNumerosSerie(numeros: string[], quantite: number): string | null {
  const propres = numeros.map((n) => n.trim());
  if (propres.some((n) => n === '')) return 'Un numéro de série est vide.';
  if (propres.length !== quantite) {
    return `${quantite} unité${quantite > 1 ? 's' : ''} à recevoir : saisissez exactement ${quantite} numéro${quantite > 1 ? 's' : ''} de série (${propres.length} reçu${propres.length > 1 ? 's' : ''}).`;
  }
  const vus = new Set<string>();
  const doublon = propres.find((n) => vus.size === vus.add(n.toUpperCase()).size);
  return doublon ? `Le numéro de série « ${doublon} » est saisi deux fois.` : null;
}
