/**
 * Historiques paginés par curseur (GET /mouvements, GET /ventes) : une
 * page de TAILLE_PAGE éléments, puis la suivante « après » le dernier
 * identifiant reçu. Une page incomplète signifie qu'il n'y en a plus.
 */
export const TAILLE_PAGE = 50;

/** Paramètre de page suivante pour useInfiniteQuery. */
export function pageSuivante<T extends { id: string }>(derniere: T[], taille = TAILLE_PAGE): string | undefined {
  return derniere.length === taille ? derniere[derniere.length - 1].id : undefined;
}

/** URL d'une page : chemin + filtres existants + limite + curseur. */
export function urlPage(chemin: string, filtres: URLSearchParams, apres: string | undefined, taille = TAILLE_PAGE): string {
  const p = new URLSearchParams(filtres);
  p.set('limite', String(taille));
  if (apres) p.set('apres', apres);
  return `${chemin}?${p.toString()}`;
}
