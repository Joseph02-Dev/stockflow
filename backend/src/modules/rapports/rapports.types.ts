import { BadRequestException } from '@nestjs/common';

/** Rapport prêt à sortir : le contrôleur choisit le format demandé. */
export interface RapportGenere {
  /** Nom de fichier sans extension : « etat-du-stock-2026-10-06 ». */
  nomFichier: string;
  pdf: () => Promise<Buffer>;
  /** CSV « ; » avec BOM UTF-8, montants en entiers bruts (ressaisissables). */
  csv: () => string;
}

/** Séries de répartition (emplacements) : encre, bleu action, puis neutres. */
export const COULEURS_SERIES = ['#2242C7', '#0E9384', '#D9922B', '#9B7BD4', '#6A91C9', '#E05A4B', '#8A94A6', '#344054'];

/** Nombre de pages d'un PDF produit par pdfkit (objets /Type /Page). */
export function compterPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

export const TYPES_MOUVEMENT_RAPPORT = [
  'ENTREE',
  'SORTIE',
  'TRANSFERT',
  'AJUSTEMENT',
  'PERIME',
  'CASSE',
  'RETOUR_CLIENT',
  'RETOUR_FOURNISSEUR',
] as const;

const JOUR = 24 * 60 * 60 * 1000;

/**
 * Période d'un rapport, bornes incluses, en jours UTC : début à 00:00,
 * fin exclue au lendemain 00:00. Par défaut, les 30 derniers jours.
 */
export function lirePeriode(debut?: string, fin?: string, maintenant = new Date()) {
  const aujourdhui = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
  const dateFin = fin ? new Date(`${fin}T00:00:00Z`) : aujourdhui;
  const dateDebut = debut ? new Date(`${debut}T00:00:00Z`) : new Date(dateFin.getTime() - 29 * JOUR);
  if (Number.isNaN(dateDebut.getTime()) || Number.isNaN(dateFin.getTime())) {
    throw new BadRequestException('Date invalide.');
  }
  if (dateDebut > dateFin) throw new BadRequestException('La date de début doit précéder la date de fin.');
  return { debut: dateDebut, fin: dateFin, finExclue: new Date(dateFin.getTime() + JOUR) };
}
