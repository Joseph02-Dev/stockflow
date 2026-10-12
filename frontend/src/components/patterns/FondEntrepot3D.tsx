import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { PALETTES, avancer, creerScene, dessiner, type Scene } from '@/lib/entrepot3d';

/** Opacité par défaut du calque : assez visible, jamais au point de gêner la lecture. */
const OPACITE = { clair: 0.32, sombre: 0.58 } as const;

/**
 * Fond animé décoratif : cartons, palettes, diables et chariots en 3D qui
 * dérivent lentement derrière le contenu (pages publiques uniquement).
 *
 * - Décoratif : aria-hidden, aucun clic intercepté, opacité réduite pour
 *   ne jamais gêner la lecture.
 * - Sobre : animation suspendue quand le fond est hors écran ou l'onglet
 *   masqué ; une seule image fixe sous prefers-reduced-motion.
 * - `ton` : 'sombre' sur un bandeau d'encre, 'clair' sur le fond papier,
 *   'auto' suit le thème de l'application (attribut data-theme).
 */
export function FondEntrepot3D({
  ton = 'auto',
  opacite,
  masque,
  className,
}: {
  ton?: 'clair' | 'sombre' | 'auto';
  opacite?: number;
  /** Dégradé CSS (mask-image) qui estompe le fond sous une zone de texte. */
  masque?: string;
  className?: string;
}) {
  const toile = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = toile.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)');
    const tonEffectif = () =>
      ton !== 'auto' ? ton : document.documentElement.getAttribute('data-theme') === 'dark' ? 'sombre' : 'clair';
    let scene: Scene | null = null;
    let visible = true;
    let image = 0;
    let precedent = 0;

    const construire = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const densite = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * densite);
      canvas.height = Math.round(height * densite);
      ctx.setTransform(densite, 0, 0, densite, 0, 0);
      const teinte = tonEffectif();
      canvas.style.opacity = String(opacite ?? OPACITE[teinte]);
      scene = creerScene(width, height, PALETTES[teinte]);
      dessiner(ctx, scene);
    };

    const boucle = (instant: number) => {
      image = 0;
      if (!scene || !visible || document.hidden || mouvementReduit.matches) return;
      const dt = precedent ? Math.min(0.05, (instant - precedent) / 1000) : 0;
      precedent = instant;
      avancer(scene, dt);
      dessiner(ctx, scene);
      image = requestAnimationFrame(boucle);
    };
    const relancer = () => {
      if (image || !visible || document.hidden || mouvementReduit.matches) return;
      precedent = 0;
      image = requestAnimationFrame(boucle);
    };

    construire();
    relancer();

    const redimension = new ResizeObserver(() => construire());
    redimension.observe(canvas);
    const visibilite = new IntersectionObserver(([entree]) => {
      visible = entree.isIntersecting;
      relancer();
    });
    visibilite.observe(canvas);
    // Changement de thème clair/sombre : nouvelles couleurs.
    const theme = new MutationObserver(() => ton === 'auto' && construire());
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', relancer);
    mouvementReduit.addEventListener('change', relancer);

    return () => {
      cancelAnimationFrame(image);
      redimension.disconnect();
      visibilite.disconnect();
      theme.disconnect();
      document.removeEventListener('visibilitychange', relancer);
      mouvementReduit.removeEventListener('change', relancer);
    };
  }, [ton, opacite]);

  return (
    <canvas
      ref={toile}
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 size-full', className)}
      // Opacité fixée à la construction, selon le thème effectif (invisible avant).
      style={{ opacity: 0, maskImage: masque, WebkitMaskImage: masque }}
    />
  );
}
