import { useEffect, useRef, useState } from 'react';

/**
 * Chiffre clé qui monte jusqu'à sa valeur (0,8 s, une fois), puis glisse
 * d'une valeur à l'autre quand les données changent. Valeur finale tout
 * de suite sous prefers-reduced-motion. Les lecteurs d'écran n'entendent
 * que la valeur finale.
 */
export function Compteur({
  valeur,
  format,
  duree = 800,
}: {
  valeur: number;
  format: (n: number) => string;
  duree?: number;
}) {
  const [reduit] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [affiche, setAffiche] = useState(reduit ? valeur : 0);
  const depart = useRef(affiche);

  useEffect(() => {
    if (reduit) return;
    const de = depart.current;
    let debut: number | null = null;
    let image = requestAnimationFrame(function pas(instant) {
      debut ??= instant;
      const progression = Math.min(1, (instant - debut) / duree);
      const v = de + (valeur - de) * (1 - (1 - progression) ** 3);
      depart.current = v;
      setAffiche(v);
      if (progression < 1) image = requestAnimationFrame(pas);
    });
    return () => cancelAnimationFrame(image);
  }, [valeur, duree, reduit]);

  return (
    <>
      <span aria-hidden="true">{format(reduit ? valeur : affiche)}</span>
      <span className="sr-only">{format(valeur)}</span>
    </>
  );
}
