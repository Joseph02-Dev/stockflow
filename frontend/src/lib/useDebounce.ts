import { useEffect, useState } from 'react';

/**
 * Retarde la propagation d'une valeur. Utilisé pour la recherche : sans
 * cela, chaque frappe déclencherait une requête réseau.
 */
export function useDebounce<T>(valeur: T, delai = 300): T {
  const [valeurRetardee, setValeurRetardee] = useState(valeur);

  useEffect(() => {
    const minuteur = setTimeout(() => setValeurRetardee(valeur), delai);
    return () => clearTimeout(minuteur);
  }, [valeur, delai]);

  return valeurRetardee;
}
