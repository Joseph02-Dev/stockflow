import { useRef, type KeyboardEvent } from 'react';
import { Info } from 'lucide-react';
import { definirPreference, usePreferenceTheme } from '@/lib/theme';
import { MODES_APPARENCE } from './donnees';
import { EnteteSection } from './EnteteSection';

/** Miniature de l'application dans un thème donné. */
function Miniature({ mode }: { mode: 'light' | 'dark' }) {
  return (
    <span className="parametres-mini" data-mode={mode} aria-hidden="true">
      <span className="parametres-mini-cote">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="parametres-mini-contenu">
        <i />
        <span>
          <i />
          <i />
        </span>
      </span>
    </span>
  );
}

/** Préférence propre à cet appareil, jamais enregistrée sur le compte. */
export function ApparenceSection() {
  const preference = usePreferenceTheme();
  const groupeRef = useRef<HTMLDivElement>(null);

  // Motif ARIA « radiogroup » : une seule entrée tabulable, ← → ↑ ↓ pour changer.
  function surTouche(e: KeyboardEvent, index: number) {
    const pas = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!pas) return;
    e.preventDefault();
    const suivant = (index + pas + MODES_APPARENCE.length) % MODES_APPARENCE.length;
    definirPreference(MODES_APPARENCE[suivant].valeur);
    groupeRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[suivant]?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <EnteteSection titre="Apparence" description="Clair, sombre, ou selon le réglage de votre téléphone ou ordinateur." />
      <div ref={groupeRef} role="radiogroup" aria-label="Apparence" className="grid gap-3 sm:grid-cols-3">
        {MODES_APPARENCE.map((mode, i) => {
          const choisi = mode.valeur === preference;
          return (
            <button
              key={mode.valeur}
              type="button"
              role="radio"
              aria-checked={choisi}
              tabIndex={choisi ? 0 : -1}
              onClick={() => definirPreference(mode.valeur)}
              onKeyDown={(e) => surTouche(e, i)}
              className="parametres-theme"
            >
              {mode.valeur === 'auto' ? (
                <span className="parametres-mini parametres-mini-auto" aria-hidden="true">
                  <Miniature mode="light" />
                  <Miniature mode="dark" />
                </span>
              ) : (
                <Miniature mode={mode.valeur} />
              )}
              <span className="flex items-center gap-2.5 px-1 pt-2.5 pb-0.5">
                <span className="parametres-radio" aria-hidden="true" />
                <span>
                  <span className="block text-[14px] font-semibold text-ink-900">{mode.libelle}</span>
                  <span className="block text-[12px] text-steel-400">{mode.aide}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="flex items-start gap-2.5 rounded-xl border border-rule bg-paper px-3.5 py-3 text-corps text-steel-500">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Ce choix ne concerne que cet appareil : il n’est pas enregistré sur votre compte.
      </p>
    </div>
  );
}
