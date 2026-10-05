import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  /** Icône affichée à gauche du champ (facultatif, ex. écrans d'authentification). */
  icone?: ReactNode;
  /** Élément interactif affiché à droite du champ (ex. bascule de visibilité du mot de passe). */
  actionDroite?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, icone, actionDroite, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedById = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-corps font-medium text-ink-900">
          {label}
        </label>
      )}
      <div className="relative">
        {icone && (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-steel-400">
            {icone}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedById}
          className={cn(
            'h-10 w-full rounded-[9px] border max-md:h-11 bg-surface text-corps text-ink-900 transition-colors',
            icone ? 'pl-9' : 'pl-3',
            actionDroite ? 'pr-9' : 'pr-3',
            'placeholder:text-steel-400 hover:border-steel-400 focus:border-action focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-action/25 disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-rupture' : 'border-rule-strong',
            className,
          )}
          {...props}
        />
        {actionDroite && (
          <span className="absolute top-1/2 right-3 -translate-y-1/2">{actionDroite}</span>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-meta text-rupture">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-meta text-steel-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
