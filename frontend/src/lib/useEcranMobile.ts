import { useSyncExternalStore } from 'react';

/** Sous 768 px : sélecteurs et fenêtres deviennent des feuilles montantes. */
const REQUETE = '(max-width: 767.98px)';

function souscrire(rappel: () => void) {
  const media = window.matchMedia(REQUETE);
  media.addEventListener('change', rappel);
  return () => media.removeEventListener('change', rappel);
}

export function useEcranMobile(): boolean {
  return useSyncExternalStore(
    souscrire,
    () => window.matchMedia(REQUETE).matches,
    () => false,
  );
}
