import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

// En dessous de ce délai, la barre n'apparaît pas : une réponse rapide ne
// doit pas faire clignoter l'écran.
const DELAI_AFFICHAGE_MS = 180;

/**
 * Barre fine en haut de l'écran, visible tant qu'une lecture ou un envoi
 * vers le serveur est en cours — y compris les rafraîchissements en
 * arrière-plan, que les squelettes ne montrent pas.
 */
export function BarreProgression() {
  const actif = useIsFetching() + useIsMutating() > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const minuterie = setTimeout(() => setVisible(actif), actif ? DELAI_AFFICHAGE_MS : 0);
    return () => clearTimeout(minuterie);
  }, [actif]);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="barre-progression h-full w-2/5 rounded-full bg-action" />
    </div>
  );
}
