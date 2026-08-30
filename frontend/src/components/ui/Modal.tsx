import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  ouvert: boolean;
  onFermer: () => void;
  titre: string;
  description?: string;
  children: ReactNode;
  pied?: ReactNode;
}

export function Modal({ ouvert, onFermer, titre, description, children, pied }: ModalProps) {
  const conteneurRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;

    function surTouche(event: KeyboardEvent) {
      if (event.key === 'Escape') onFermer();
    }
    document.addEventListener('keydown', surTouche);

    // Empêche l'arrière-plan de défiler pendant que la modale est ouverte.
    const overflowInitial = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Déplace le focus dans la modale pour les utilisateurs au clavier.
    conteneurRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', surTouche);
      document.body.style.overflow = overflowInitial;
    };
  }, [ouvert, onFermer]);

  if (!ouvert) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-secondary/40"
        onClick={onFermer}
        aria-hidden="true"
      />

      <div
        ref={conteneurRef}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-(--radius-modal) bg-surface shadow-lg"
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

        <div className="px-5 py-4">{children}</div>

        {pied && (
          <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-4">{pied}</div>
        )}
      </div>
    </div>
  );
}
