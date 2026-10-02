import { forwardRef, useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface Option {
  valeur: string;
  libelle: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: Option[];
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, error, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-corps font-medium text-ink-900">
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={cn(
          'h-9 rounded-md border bg-surface px-3 text-corps text-ink-900 transition-colors hover:border-steel-400 focus:border-action focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-action/25',
          'disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-rupture' : 'border-rule-strong',
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${selectId}-error`} className="text-meta text-rupture">
          {error}
        </p>
      )}
    </div>
  );
});
