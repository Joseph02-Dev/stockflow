import { formatNombre } from './format';

/** « 8 423 501 GNF » — séparateurs de milliers, jamais de décimales. */
export function gnf(montant: number): string {
  return `${formatNombre(montant)} GNF`;
}

/** Date et heure courtes, fuseau local : « 11/09/2026 · 11:24 ». */
export function dateHeure(date: string | Date): string {
  const d = new Date(date);
  const jour = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour} · ${heure}`;
}

export function dateCourte(date: string | Date): string {
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
