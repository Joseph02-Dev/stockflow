import { cn } from '@/lib/cn';

/**
 * Lien d'action : mène vers une autre page ou un autre écran. Partout le
 * même : texte orange en gras, flèche qui glisse au survol, zone tactile
 * de 44 px de haut (agrandie par la marge, sans décaler la mise en page).
 * Les actions qui restent sur place utilisent <Button>.
 */
export function lienActionClasses(className?: string) {
  return cn(
    'group/lien -my-2.5 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md py-2.5 text-corps font-semibold text-action transition-colors hover:text-action-dark',
    className,
  );
}

/**
 * Lien au fil d'une phrase (« Déjà un compte ? Se connecter ») : même
 * couleur et même graisse que le lien d'action, sans flèche.
 */
export function lienEnLigneClasses(className?: string) {
  return cn('font-semibold text-action underline-offset-2 transition-colors hover:text-action-dark hover:underline', className);
}
