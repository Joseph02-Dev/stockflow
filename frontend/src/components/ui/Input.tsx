import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedById = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-text-primary">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        className={cn(
          'rounded-(--radius-button) border bg-surface px-3 py-2 text-sm text-text-primary',
          'placeholder:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50',
          error ? 'border-error' : 'border-border-subtle',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
