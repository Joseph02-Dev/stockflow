import { useCallback, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { definirPreference, usePreferenceTheme } from '@/lib/theme';
import type { PreferenceTheme } from '@/lib/theme';
import { usePanneauFlottant } from '@/lib/usePanneauFlottant';

const LARGEUR_MENU = 232;

const MODES: { valeur: PreferenceTheme; libelle: string; Icone: typeof Sun }[] = [
  { valeur: 'light', libelle: 'Clair', Icone: Sun },
  { valeur: 'dark', libelle: 'Sombre', Icone: Moon },
  { valeur: 'auto', libelle: 'Automatique', Icone: Monitor },
];

const EXPLICATION_AUTO = 'Automatique suit le réglage de votre téléphone ou de votre ordinateur.';

/**
 * Aperçu du rendu : carré clair, sombre, ou moitié-moitié. Couleurs fixes
 * (craie / voile) : la vignette montre une apparence, elle ne la suit pas.
 */
function Vignette({ mode }: { mode: PreferenceTheme }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-7 shrink-0 rounded-[6px] border border-rule-strong',
        mode === 'light' && 'bg-craie',
        mode === 'dark' && 'bg-voile',
        mode === 'auto' && 'bg-[linear-gradient(135deg,var(--color-craie)_50%,var(--color-voile)_50%)]',
      )}
    />
  );
}

/**
 * Menu d'apparence de la barre supérieure (bureau) : bouton 34 px, menu
 * 232 px en portail, aligné à droite du bouton. Fermeture au clic
 * extérieur et à Échap ; ↑ ↓ Début Fin pour naviguer, Entrée ou Espace
 * pour choisir. Même mécanique de panneau que la liste déroulante.
 */
export function SelecteurTheme({ className }: { className?: string }) {
  const preference = usePreferenceTheme();
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const boutonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const idMenu = useId();
  const courant = MODES.find((m) => m.valeur === preference) ?? MODES[2];

  const fermer = useCallback((rendreFocus = true) => {
    setOuvert(false);
    if (rendreFocus) boutonRef.current?.focus();
  }, []);
  const largeur = useCallback(() => LARGEUR_MENU, []);
  const hauteurNaturelle = useCallback(() => menuRef.current?.scrollHeight ?? 0, []);
  const position = usePanneauFlottant({
    ouvert,
    ancreRef: boutonRef,
    panneauRef: menuRef,
    fermer,
    positionner: true,
    largeur,
    hauteurNaturelle,
    aligner: 'droite',
  });

  function ouvrir() {
    setActif(MODES.findIndex((m) => m.valeur === preference));
    setOuvert(true);
    // Le focus entre dans le menu une fois rendu.
    requestAnimationFrame(() => menuRef.current?.focus());
  }

  function choisir(index: number) {
    definirPreference(MODES[index].valeur);
    fermer();
  }

  function surToucheBouton(e: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      ouvrir();
    }
  }

  function surToucheMenu(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActif((a) => (a + 1) % MODES.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActif((a) => (a - 1 + MODES.length) % MODES.length);
        break;
      case 'Home':
        e.preventDefault();
        setActif(0);
        break;
      case 'End':
        e.preventDefault();
        setActif(MODES.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choisir(actif);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        fermer();
        break;
      case 'Tab':
        fermer(false);
        break;
    }
  }

  const menu = ouvert && (
    <div
      ref={menuRef}
      id={idMenu}
      role="menu"
      tabIndex={-1}
      aria-label="Apparence"
      aria-activedescendant={`${idMenu}-${actif}`}
      onKeyDown={surToucheMenu}
      style={
        position
          ? { left: position.gauche, width: position.largeur, top: position.haut, bottom: position.bas }
          : // Premier rendu, le temps de mesurer : transparent mais focalisable.
            { opacity: 0, left: 0, top: 0, width: LARGEUR_MENU }
      }
      className="fixed z-[60] flex flex-col overflow-hidden rounded-[12px] border border-rule bg-surface shadow-pop outline-none"
    >
      <div className="p-1">
        {MODES.map((mode, i) => {
          const choisi = mode.valeur === preference;
          return (
            <div
              key={mode.valeur}
              id={`${idMenu}-${i}`}
              role="menuitemradio"
              aria-checked={choisi}
              onPointerMove={() => setActif(i)}
              onClick={() => choisir(i)}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 text-corps',
                i === actif && 'bg-action-wash',
                choisi ? 'font-medium text-action' : 'text-ink-900',
              )}
            >
              <Vignette mode={mode.valeur} />
              <span className="flex-1">{mode.libelle}</span>
              {choisi && <Check className="size-4 shrink-0 text-action" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
      <p className="border-t border-rule bg-entete-tableau px-3 py-2 text-meta text-steel-500">{EXPLICATION_AUTO}</p>
    </div>
  );

  return (
    <>
      <button
        ref={boutonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-controls={ouvert ? idMenu : undefined}
        aria-label={`Apparence : ${courant.libelle}`}
        onClick={() => (ouvert ? fermer() : ouvrir())}
        onKeyDown={surToucheBouton}
        className={cn(
          'h-[34px] items-center gap-2 rounded-md px-2.5 text-corps text-steel-500 transition-colors hover:bg-survol hover:text-ink-900',
          ouvert && 'bg-survol text-ink-900',
          className,
        )}
      >
        <courant.Icone className="size-4 shrink-0" aria-hidden="true" />
        <span>{courant.libelle}</span>
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-steel-400 transition-transform', ouvert && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {menu && createPortal(menu, document.body)}
    </>
  );
}

/**
 * Choix d'apparence affiché à plat (menu « Plus » sur mobile, Paramètres) :
 * groupe de boutons radio, mêmes vignettes et même explication.
 */
export function ChoixApparence({ className }: { className?: string }) {
  const preference = usePreferenceTheme();
  const idTitre = useId();
  const groupeRef = useRef<HTMLDivElement>(null);

  // Motif ARIA « radiogroup » : une seule entrée tabulable, ← → ↑ ↓ pour changer.
  function surTouche(e: KeyboardEvent, index: number) {
    const pas = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!pas) return;
    e.preventDefault();
    const suivant = (index + pas + MODES.length) % MODES.length;
    definirPreference(MODES[suivant].valeur);
    groupeRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[suivant]?.focus();
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p id={idTitre} className="text-corps font-medium text-ink-900">
        Apparence
      </p>
      <div ref={groupeRef} role="radiogroup" aria-labelledby={idTitre} className="grid grid-cols-3 gap-2">
        {MODES.map((mode, i) => {
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
              className={cn(
                'flex min-h-11 flex-col items-center gap-1.5 rounded-md border px-2 py-2.5 text-meta font-medium transition-colors',
                choisi
                  ? 'border-action bg-action-wash text-action'
                  : 'border-rule-strong bg-surface-elevee text-ink-900 hover:bg-survol',
              )}
            >
              <Vignette mode={mode.valeur} />
              {mode.libelle}
            </button>
          );
        })}
      </div>
      <p className="text-meta text-steel-500">{EXPLICATION_AUTO}</p>
    </div>
  );
}
