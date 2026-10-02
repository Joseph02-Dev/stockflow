import { cn } from '@/lib/cn';

/**
 * Contrôle segmenté : bascule entre des vues d'un même écran. Segment
 * actif sur l'encre, pour se distinguer des boutons d'action (ultramarine).
 */
export function Onglets<C extends string>({
  onglets,
  actif,
  onChange,
  libelle,
}: {
  onglets: readonly { cle: C; libelle: string }[];
  actif: C;
  onChange: (cle: C) => void;
  libelle: string;
}) {
  return (
    <div
      className="inline-flex max-w-full self-start overflow-x-auto rounded-md border border-rule bg-surface p-0.5"
      role="tablist"
      aria-label={libelle}
    >
      {onglets.map((onglet) => (
        <button
          key={onglet.cle}
          type="button"
          role="tab"
          aria-selected={actif === onglet.cle}
          onClick={() => onChange(onglet.cle)}
          className={cn(
            'h-8 shrink-0 rounded-sm px-3 text-corps font-medium whitespace-nowrap transition-colors',
            actif === onglet.cle ? 'bg-ink-800 text-white' : 'text-steel-500 hover:text-ink-900',
          )}
        >
          {onglet.libelle}
        </button>
      ))}
    </div>
  );
}
