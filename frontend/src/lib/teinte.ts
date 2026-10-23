const TEINTES = ['var(--color-serie-1)', 'var(--color-serie-2)', 'var(--color-serie-3)', 'var(--color-serie-4)', 'var(--color-serie-5)'];

/** Couleur stable d'un identifiant (fournisseur…), pour le reconnaître d'une section à l'autre. */
export function teinteSerie(id: string): string {
  let somme = 0;
  for (const c of id) somme = (somme * 31 + c.charCodeAt(0)) >>> 0;
  return TEINTES[somme % TEINTES.length];
}
