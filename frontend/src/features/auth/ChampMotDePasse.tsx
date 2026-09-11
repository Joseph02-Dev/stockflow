import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Input } from '@/components/ui/Input';

interface ChampMotDePasseProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
  hint?: string;
}

export const ChampMotDePasse = forwardRef<HTMLInputElement, ChampMotDePasseProps>(function ChampMotDePasse(
  { label, error, hint, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      ref={ref}
      label={label}
      error={error}
      hint={hint}
      type={visible ? 'text' : 'password'}
      icone={<Lock className="size-4" aria-hidden="true" />}
      actionDroite={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          className="text-text-secondary hover:text-text-primary"
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      }
      {...props}
    />
  );
});
