import { cn } from '@/lib/cn';

export type VarianteBouton = 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger';

const variantes: Record<VarianteBouton, string> = {
  // Relief « pressable » : reflet en haut, halo coloré dessous, éclat qui
  // balaie le bouton au survol (voir .bouton-relief dans index.css).
  primary: 'bouton-relief bg-action text-sur-couleur enabled:hover:bg-action-dark',
  secondary:
    'border border-rule-strong bg-surface text-ink-900 shadow-card enabled:hover:border-steel-400 enabled:hover:bg-survol',
  dark: 'bg-inverse text-sur-inverse shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] enabled:hover:bg-inverse-survol',
  ghost: 'bg-transparent text-steel-700 hover:bg-survol hover:text-ink-900',
  danger: 'bouton-relief bouton-relief-danger bg-rupture text-sur-couleur enabled:hover:opacity-95',
};

/**
 * Classes d'un bouton, exposées séparément du composant pour que les
 * liens (<Link>) qui se présentent comme des boutons partagent
 * exactement la même grammaire visuelle.
 */
export interface FormeBouton {
  /** md = 36 px (défaut), sm = 32 px pour les actions de ligne. */
  taille?: 'md' | 'sm';
  /** Bouton carré ne contenant qu'une icône (libellé via aria-label). */
  icone?: boolean;
}

export function boutonClasses(
  variante: VarianteBouton = 'primary',
  className?: string,
  { taille = 'md', icone = false }: FormeBouton = {},
) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-corps font-semibold whitespace-nowrap [&_svg]:shrink-0',
    // Réponse au geste : léger soulèvement au survol, enfoncement à l'appui.
    'transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-sortie enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.98] motion-reduce:transform-none',
    taille === 'md' ? 'h-9' : 'h-8',
    icone ? (taille === 'md' ? 'w-9' : 'w-8') : taille === 'md' ? 'px-3.5' : 'px-3',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    // En cours d'envoi : bouton inactif mais pas grisé — il travaille.
    'aria-busy:disabled:cursor-progress aria-busy:disabled:opacity-100',
    variantes[variante],
    className,
  );
}
