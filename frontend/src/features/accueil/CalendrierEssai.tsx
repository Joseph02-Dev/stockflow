import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Calendrier décoratif de l'essai : les jours se remplissent un à un, puis
 * la boucle reprend après une pause. Ne tourne que lorsqu'il est à l'écran ;
 * avant, il affiche l'essai complet. Sous prefers-reduced-motion, la boucle
 * est plus lente et sans agrandissement (voir accueil.css, `.essai-jour`).
 */

const PAS_MS = 110;
const PAUSE_MS = 2600;

export function CalendrierEssai({ jours }: { jours: number }) {
  const racine = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [jour, setJour] = useState(jours);

  useEffect(() => {
    const element = racine.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observateur = new IntersectionObserver(([entree]) => setVisible(entree.isIntersecting));
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const pas = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? PAS_MS * 1.6 : PAS_MS;
    const minuterie = window.setTimeout(
      () => setJour((j) => (j >= jours ? 1 : j + 1)),
      jour >= jours ? PAUSE_MS : pas,
    );
    return () => window.clearTimeout(minuterie);
  }, [visible, jour, jours]);

  const restants = jours - jour;
  return (
    <div ref={racine} className="essai-calendrier" aria-hidden="true">
      <div className="essai-calendrier-tete">
        <b>Votre essai</b>
        <span>
          Jour <span className="font-mono text-ink-900">{jour}</span> / {jours}
        </span>
      </div>
      <div className="essai-jours">
        {Array.from({ length: jours }, (_, i) => (
          <span
            key={i}
            className={cn('essai-jour', i < jour - 1 && 'essai-jour-fait', i === jour - 1 && 'essai-jour-courant')}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <div className="essai-calendrier-pied">
        <span className="essai-barre">
          <i style={{ width: `${(jour / jours) * 100}%` }} />
        </span>
        <span>{restants > 0 ? `${restants} jour${restants > 1 ? 's' : ''} restant${restants > 1 ? 's' : ''}` : 'Essai complet'}</span>
      </div>
    </div>
  );
}
