import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/** Écart entre l'ancre et le panneau, et marge minimale avec le bord de l'écran. */
const ECART = 6;
const MARGE = 8;

export interface PositionPanneau {
  gauche: number;
  largeur: number;
  haut?: number;
  bas?: number;
  hauteurMax: number;
}

interface Options {
  ouvert: boolean;
  ancreRef: RefObject<HTMLElement | null>;
  panneauRef: RefObject<HTMLElement | null>;
  /** Fermeture demandée (clic extérieur, ancre sortie de l'écran). */
  fermer: (rendreFocus: boolean) => void;
  /** false : aucun positionnement (feuille montante sur mobile). */
  positionner: boolean;
  /** Largeur du panneau, calculée depuis le rectangle de l'ancre. */
  largeur: (ancre: DOMRect) => number;
  /** Hauteur que prendrait le panneau sans contrainte. */
  hauteurNaturelle: () => number;
  /** Aligné sur le bord gauche (défaut) ou droit de l'ancre. */
  aligner?: 'gauche' | 'droite';
  /** Toute valeur dont le changement impose de repositionner (ex. nombre d'entrées). */
  dependance?: unknown;
}

/**
 * Panneau flottant ancré à un élément, rendu en portail (position: fixed).
 *
 * - Sous l'ancre, ou au-dessus faute de place ; jamais hors de l'écran.
 * - Suit l'ancre au défilement et au redimensionnement ; se ferme si
 *   l'ancre sort de l'écran.
 * - Se ferme au pointeur posé hors de l'ancre et du panneau.
 *
 * Mécanique partagée par la liste déroulante (Selecteur) et le menu
 * d'apparence (SelecteurTheme).
 */
export function usePanneauFlottant({
  ouvert,
  ancreRef,
  panneauRef,
  fermer,
  positionner,
  largeur,
  hauteurNaturelle,
  aligner = 'gauche',
  dependance,
}: Options): PositionPanneau | null {
  const [position, setPosition] = useState<PositionPanneau | null>(null);

  const placer = useCallback(() => {
    const ancre = ancreRef.current;
    if (!ancre || !panneauRef.current) return;
    const r = ancre.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) {
      fermer(false);
      return;
    }
    const naturelle = hauteurNaturelle();
    const dessous = window.innerHeight - r.bottom - ECART - MARGE;
    const dessus = r.top - ECART - MARGE;
    const versLeHaut = dessous < naturelle && dessus > dessous;
    const l = largeur(r);
    const depart = aligner === 'droite' ? r.right - l : r.left;
    setPosition({
      gauche: Math.max(MARGE, Math.min(depart, window.innerWidth - l - MARGE)),
      largeur: l,
      ...(versLeHaut ? { bas: window.innerHeight - r.top + ECART } : { haut: r.bottom + ECART }),
      hauteurMax: Math.max(160, versLeHaut ? dessus : dessous),
    });
  }, [ancreRef, panneauRef, fermer, hauteurNaturelle, largeur, aligner]);

  // Avant peinture : le panneau n'apparaît jamais à une position périmée.
  useLayoutEffect(() => {
    if (ouvert && positionner) placer();
  }, [ouvert, positionner, placer, dependance]);

  useEffect(() => {
    if (!ouvert) return;
    function surDefilement(e: Event) {
      if (panneauRef.current?.contains(e.target as Node)) return;
      if (positionner) placer();
    }
    function surPointeur(e: PointerEvent) {
      const cible = e.target as Node;
      if (ancreRef.current?.contains(cible) || panneauRef.current?.contains(cible)) return;
      fermer(false);
    }
    window.addEventListener('scroll', surDefilement, true);
    window.addEventListener('resize', surDefilement);
    document.addEventListener('pointerdown', surPointeur);
    return () => {
      window.removeEventListener('scroll', surDefilement, true);
      window.removeEventListener('resize', surDefilement);
      document.removeEventListener('pointerdown', surPointeur);
    };
  }, [ouvert, positionner, placer, fermer, ancreRef, panneauRef]);

  return ouvert && positionner ? position : null;
}
