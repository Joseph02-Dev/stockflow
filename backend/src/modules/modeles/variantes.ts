/**
 * Règles pures des variantes : grille des combinaisons, clé d'unicité,
 * nom et référence générés. Sans accès base : testées unitairement.
 */
export interface Attribut {
  nom: string;
  valeurs: string[];
}

/** Au-delà, la grille devient ingérable (et la limite de références aussi). */
export const MAX_VARIANTES_PAR_MODELE = 200;

export type ValeursVariante = Record<string, string>;

/** Espaces superflus retirés, doublons (sans tenir compte de la casse) écartés. */
export function normaliserAttributs(attributs: Attribut[]): Attribut[] {
  const unique = (liste: string[]) => {
    const vus = new Set<string>();
    return liste
      .map((v) => v.trim().replace(/\s+/g, ' '))
      .filter((v) => v !== '' && !vus.has(v.toLowerCase()) && vus.add(v.toLowerCase()));
  };
  return attributs.map((a) => ({ nom: a.nom.trim().replace(/\s+/g, ' '), valeurs: unique(a.valeurs) }));
}

/** Nombre de variantes de la grille complète. */
export function tailleGrille(attributs: Attribut[]): number {
  return attributs.reduce((n, a) => n * a.valeurs.length, attributs.length > 0 ? 1 : 0);
}

/** Produit cartésien, dans l'ordre des attributs : [{Couleur: Rouge, Taille: S}, …]. */
export function combinaisons(attributs: Attribut[]): ValeursVariante[] {
  if (attributs.length === 0) return [];
  return attributs.reduce<ValeursVariante[]>(
    (acc, attribut) => acc.flatMap((c) => attribut.valeurs.map((v) => ({ ...c, [attribut.nom]: v }))),
    [{}],
  );
}

/** « couleur=rouge|taille=m » : indépendante de la casse et de l'ordre des clés. */
export function cleVariante(valeurs: ValeursVariante): string {
  return Object.keys(valeurs)
    .map((nom) => [nom.toLowerCase(), valeurs[nom].toLowerCase()])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([nom, valeur]) => `${nom}=${valeur}`)
    .join('|');
}

/** « T-shirt — Rouge / M » */
export function nomVariante(nomModele: string, valeurs: ValeursVariante, ordre: string[]): string {
  return `${nomModele} — ${ordre.map((nom) => valeurs[nom]).join(' / ')}`;
}

const segment = (texte: string) =>
  texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');

/** « TSHIRT-ROUGE-M » ; sans préfixe, pas de référence générée. */
export function referenceVariante(prefixe: string | null | undefined, valeurs: ValeursVariante, ordre: string[]): string | null {
  if (!prefixe?.trim()) return null;
  return [prefixe.trim().toUpperCase(), ...ordre.map((nom) => segment(valeurs[nom]))].filter(Boolean).join('-');
}

/**
 * Modification des attributs d'un modèle qui a déjà des variantes : on
 * peut ajouter des valeurs, jamais en retirer ni changer les axes (les
 * variantes existantes perdraient leur sens). Renvoie le motif du refus.
 */
export function refusModificationAttributs(avant: Attribut[], apres: Attribut[]): string | null {
  const noms = (liste: Attribut[]) => liste.map((a) => a.nom.toLowerCase()).sort().join('|');
  if (noms(avant) !== noms(apres)) {
    return 'Les axes de variation (Taille, Couleur…) ne changent plus une fois les variantes créées : créez un nouveau modèle.';
  }
  for (const ancien of avant) {
    const nouveau = apres.find((a) => a.nom.toLowerCase() === ancien.nom.toLowerCase())!;
    const gardees = new Set(nouveau.valeurs.map((v) => v.toLowerCase()));
    const retiree = ancien.valeurs.find((v) => !gardees.has(v.toLowerCase()));
    if (retiree) {
      return `La valeur « ${retiree} » (${ancien.nom}) a déjà des variantes : archivez-les plutôt que de la retirer.`;
    }
  }
  return null;
}
