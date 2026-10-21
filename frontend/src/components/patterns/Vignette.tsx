import { cn } from '@/lib/cn';

/**
 * Vignette carrée d'un produit ou d'un fournisseur : la photo si elle
 * existe, sinon les initiales sur fond neutre — jamais un carré vide.
 */
export function Vignette({
  nom,
  photoUrl,
  taille = 36,
  teinte,
  className,
}: {
  nom: string;
  photoUrl?: string | null;
  taille?: number;
  /** Couleur des initiales sans photo (fond et bordure en dérivent) ; neutre par défaut. */
  teinte?: string;
  className?: string;
}) {
  const initiales = nom
    .split(/\s+/)
    .filter(Boolean)
    .map((mot) => mot[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-rule bg-survol text-meta font-semibold text-steel-500',
        className,
      )}
      style={{
        width: taille,
        height: taille,
        ...(teinte && !photoUrl
          ? {
              color: teinte,
              background: `color-mix(in oklab, ${teinte} 14%, var(--color-surface))`,
              borderColor: `color-mix(in oklab, ${teinte} 24%, transparent)`,
            }
          : {}),
      }}
      aria-hidden="true"
    >
      {photoUrl ? <img src={photoUrl} alt="" className="size-full object-cover" /> : initiales}
    </span>
  );
}
