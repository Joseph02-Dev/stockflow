import { cn } from '@/lib/cn';

export type VarianteBouton = 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger';

const variantes: Record<VarianteBouton, string> = {
  // Filet blanc interne en haut : donne au bouton principal un relief
  // « pressable » sans recourir à une ombre portée supplémentaire.
  primary:
    'bg-action text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] hover:bg-action-dark',
  secondary: 'border border-rule-strong bg-surface text-ink-900 hover:bg-paper',
  dark: 'bg-ink-800 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-ink-700',
  ghost: 'bg-transparent text-steel-700 hover:bg-paper hover:text-ink-900',
  danger: 'bg-rupture text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] hover:opacity-90',
};

/**
 * Classes d'un bouton, exposées séparément du composant pour que les
 * liens (<Link>) qui se présentent comme des boutons partagent
 * exactement la même grammaire visuelle.
 */
export function boutonClasses(variante: VarianteBouton = 'primary', className?: string) {
  return cn(
    'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md px-3.5 text-corps font-medium whitespace-nowrap transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    variantes[variante],
    className,
  );
}
