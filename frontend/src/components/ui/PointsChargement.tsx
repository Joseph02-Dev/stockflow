import { cn } from '@/lib/cn';

/** Trois points animés : indicateur d'envoi compact (boutons, textes). */
export function PointsChargement({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('points-chargement inline-flex items-center gap-[3px]', className)}>
      <span className="size-[5px] rounded-full bg-current" />
      <span className="size-[5px] rounded-full bg-current" />
      <span className="size-[5px] rounded-full bg-current" />
    </span>
  );
}
