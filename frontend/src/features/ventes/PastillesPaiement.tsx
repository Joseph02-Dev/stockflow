import { cn } from '@/lib/cn';
import { MODES } from './modes';
import type { ModePaiement } from './types';

/** Pastilles sélectionnables (groupe radio accessible au clavier). */
export function PastillesPaiement<M extends ModePaiement>({
  modes,
  valeur,
  onChange,
  nom,
  desactives = [],
  libelle,
}: {
  modes: readonly M[];
  valeur: M | null;
  onChange: (mode: M) => void;
  nom: string;
  desactives?: M[];
  libelle: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-corps font-medium text-ink-900">{libelle}</legend>
      {/* Deux colonnes : les libellés (« Orange Money ») restent entiers même dans un panneau étroit. */}
      <div className="grid grid-cols-2 gap-2">
        {modes.map((mode) => {
          const { libelle: texte, Icone, actif, point } = MODES[mode];
          const selectionne = valeur === mode;
          const desactive = desactives.includes(mode);
          return (
            <label
              key={mode}
              className={cn(
                'flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-2 text-corps font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-action',
                selectionne ? actif : 'border-rule-strong bg-surface text-steel-700 hover:border-steel-400',
                desactive && 'cursor-not-allowed opacity-45 hover:border-rule-strong',
              )}
            >
              <input
                type="radio"
                name={nom}
                value={mode}
                checked={selectionne}
                disabled={desactive}
                onChange={() => onChange(mode)}
                className="sr-only"
              />
              {selectionne ? (
                <Icone className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <span className={cn('size-2 shrink-0 rounded-full', point)} aria-hidden="true" />
              )}
              <span className="truncate">{texte}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
