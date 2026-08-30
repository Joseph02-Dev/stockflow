import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  ouvert: boolean;
  onFermer: () => void;
  titre: string;
  description?: string;
  children: ReactNode;
}

/**
 * Panneau latéral droit, utilisé pour les formulaires courts qui ne
 * justifient pas de quitter le contexte de la liste (produits,
 * fournisseurs) — voir les arbitrages écran/drawer de la phase UX.
 */
export function Drawer({ ouvert, onFermer, titre, description, children }: DrawerProps) {
  const conteneurRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;

    function surTouche(event: KeyboardEvent) {
      if (event.key === 'Escape') onFermer();
    }
    document.addEventListener('keydown', surTouche);

    const overflowInitial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    conteneurRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', surTouche);
      document.body.style.overflow = overflowInitial;
    };
  }, [ouvert, onFermer]);

  if (!ouvert) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-secondary/40" onClick={onFermer} aria-hidden="true" />

      <div
        ref={conteneurRef}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-lg"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <div>
            <h2 className="font-semibold text-text-primary">{titre}</h2>
            {description && <p className="mt-0.5 text-sm text-text-secondary">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="rounded-(--radius-button) p-1 text-text-secondary transition-colors hover:bg-background hover:text-text-primary"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
