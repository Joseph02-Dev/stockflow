import type { ReactNode } from 'react';

/** Titre d'une section des paramètres, avec son action éventuelle. */
export function EnteteSection({ titre, description, action }: { titre: string; description: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-[21px] font-semibold tracking-[-0.015em] text-ink-900">{titre}</h2>
        <p className="mt-0.5 text-[14px] text-steel-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** En-tête d'une carte : titre et une ligne d'explication. */
export function EnteteCarte({ titre, meta, action }: { titre: string; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <h3 className="text-[15.5px] font-semibold text-ink-900">{titre}</h3>
        {meta && <p className="mt-0.5 text-[12.5px] text-steel-400">{meta}</p>}
      </div>
      {action}
    </div>
  );
}
