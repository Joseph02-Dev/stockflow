import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ActionMenu {
  libelle: string;
  Icone: typeof MoreHorizontal;
  onSelect: () => void;
  danger?: boolean;
}

/** Menu d'actions d'une ligne : ouvert au clic, fermé par Échap ou clic extérieur. */
export function MenuActions({ libelle, actions }: { libelle: string; actions: ActionMenu[] }): ReactNode {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    function surClic(e: MouseEvent) {
      if (!racine.current?.contains(e.target as Node)) setOuvert(false);
    }
    function surTouche(e: KeyboardEvent) {
      if (e.key === 'Escape') setOuvert(false);
    }
    document.addEventListener('mousedown', surClic);
    document.addEventListener('keydown', surTouche);
    return () => {
      document.removeEventListener('mousedown', surClic);
      document.removeEventListener('keydown', surTouche);
    };
  }, [ouvert]);

  return (
    <div ref={racine} className="relative inline-block">
      <button
        type="button"
        aria-label={libelle}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        className="flex size-8 items-center justify-center rounded-md text-steel-500 hover:bg-paper hover:text-ink-900"
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </button>
      {ouvert && (
        <div
          role="menu"
          className="absolute top-9 right-0 z-20 min-w-[200px] rounded-md border border-rule bg-surface p-1 shadow-pop"
        >
          {actions.map(({ libelle: l, Icone, onSelect, danger }) => (
            <button
              key={l}
              type="button"
              role="menuitem"
              onClick={() => {
                setOuvert(false);
                onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-corps',
                danger ? 'text-rupture hover:bg-rupture-wash' : 'text-ink-900 hover:bg-paper',
              )}
            >
              <Icone className="size-4 shrink-0" aria-hidden="true" />
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
