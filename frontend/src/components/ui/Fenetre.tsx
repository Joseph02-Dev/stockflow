import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useEcranMobile } from '@/lib/useEcranMobile';
import { useBalayageFermeture } from '@/lib/useBalayageFermeture';
import { Button } from './Button';

export interface FenetreProps {
  ouvert: boolean;
  onFermer: () => void;
  titre: string;
  description?: string;
  children: ReactNode;
  /** Actions (Annuler · Enregistrer) : toujours visibles, hors de la zone qui défile. */
  pied?: ReactNode;
  /**
   * Saisie en cours (ex. formState.isDirty) : un clic sur le fond, Échap
   * ou la croix demandent confirmation avant de fermer.
   */
  modifie?: boolean;
}

const FOCALISABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const CHAMPS = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([aria-disabled="true"])';

// Fenêtres ouvertes, de la plus ancienne à la plus récente : seule la
// dernière réagit à Échap.
const pile: string[] = [];

// Blocage du défilement de la page, partagé entre fenêtres imbriquées.
// Sur iOS, overflow: hidden sur body ne suffit pas : la page est figée en
// position: fixed à sa position de défilement, restaurée à la fermeture.
let verrous = 0;
let positionSauvegardee = 0;
function verrouillerDefilement() {
  if (verrous++ > 0) return;
  positionSauvegardee = window.scrollY;
  Object.assign(document.body.style, {
    position: 'fixed',
    top: `-${positionSauvegardee}px`,
    left: '0',
    right: '0',
    overflow: 'hidden',
  });
}
function deverrouillerDefilement() {
  if (--verrous > 0) return;
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '', overflow: '' });
  window.scrollTo(0, positionSauvegardee);
}

function visibles(racine: HTMLElement, selecteur: string) {
  return [...racine.querySelectorAll<HTMLElement>(selecteur)].filter((e) => e.getClientRects().length > 0);
}

/**
 * Structure commune des fenêtres de saisie, en trois zones : en-tête fixe,
 * corps qui défile seul, pied fixe. Hauteur bornée à 86dvh — dvh et non
 * vh : sur mobile, 100vh ignore la barre d'adresse et la fenêtre dépassait
 * réellement l'écran, cachant « Enregistrer ».
 *
 * Bureau : modale centrée ou tiroir latéral. Sous 768 px : feuille
 * montante (poignée, fermeture par balayage ou par le fond).
 * Focus piégé dans la fenêtre, premier champ focalisé à l'ouverture,
 * focus rendu à l'élément déclencheur à la fermeture.
 */
export function Fenetre({
  ouvert,
  onFermer,
  titre,
  description,
  children,
  pied,
  modifie = false,
  variante,
  largeur,
}: FenetreProps & { variante: 'modale' | 'tiroir'; largeur: string }) {
  const id = useId();
  const mobile = useEcranMobile();
  const dialogueRef = useRef<HTMLDivElement>(null);
  const corpsRef = useRef<HTMLDivElement>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [suite, setSuite] = useState(false);

  const demanderFermeture = useCallback(() => {
    if (modifie) setConfirmation(true);
    else onFermer();
  }, [modifie, onFermer]);

  // Ouverture : verrou du défilement, pile, focus ; fermeture : tout est rendu.
  useEffect(() => {
    if (!ouvert) return;
    const declencheur = document.activeElement as HTMLElement | null;
    verrouillerDefilement();
    pile.push(id);
    const dialogue = dialogueRef.current;
    if (dialogue) {
      const premierChamp = corpsRef.current ? visibles(corpsRef.current, CHAMPS)[0] : undefined;
      (premierChamp ?? dialogue).focus();
    }
    return () => {
      pile.splice(pile.indexOf(id), 1);
      deverrouillerDefilement();
      if (declencheur?.isConnected) declencheur.focus();
    };
  }, [ouvert, id]);

  useEffect(() => {
    if (!ouvert) return;
    function surTouche(e: globalThis.KeyboardEvent) {
      // defaultPrevented : un sélecteur ouvert dans la fenêtre a déjà traité Échap.
      if (e.key !== 'Escape' || e.defaultPrevented || pile[pile.length - 1] !== id) return;
      if (confirmation) setConfirmation(false);
      else demanderFermeture();
    }
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [ouvert, id, confirmation, demanderFermeture]);

  // Dégradé en bas du corps tant qu'il reste du contenu à faire défiler.
  const mesurer = useCallback(() => {
    const corps = corpsRef.current;
    if (corps) setSuite(corps.scrollTop + corps.clientHeight < corps.scrollHeight - 2);
  }, []);
  useLayoutEffect(() => {
    if (!ouvert || !corpsRef.current) return;
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(corpsRef.current);
    if (corpsRef.current.firstElementChild) observateur.observe(corpsRef.current.firstElementChild);
    return () => observateur.disconnect();
  }, [ouvert, mesurer, children]);

  const balayage = useBalayageFermeture(demanderFermeture);

  if (!ouvert) return null;

  // Tabulation circulaire à l'intérieur de la fenêtre.
  function surTabulation(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !dialogueRef.current) return;
    const elements = visibles(dialogueRef.current, FOCALISABLES);
    if (elements.length === 0) return;
    const [premier, dernier] = [elements[0], elements[elements.length - 1]];
    if (e.shiftKey && (document.activeElement === premier || document.activeElement === dialogueRef.current)) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  }

  const tiroir = variante === 'tiroir' && !mobile;

  return (
    <div className={cn('fixed inset-0 z-50 flex', mobile ? 'items-end' : tiroir ? 'justify-end' : 'items-center justify-center p-4')}>
      <div className="absolute inset-0 bg-ink-900/50" onClick={demanderFermeture} aria-hidden="true" />

      <div
        ref={dialogueRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titre`}
        aria-describedby={description ? `${id}-description` : undefined}
        tabIndex={-1}
        onKeyDown={surTabulation}
        style={mobile ? balayage.style : undefined}
        className={cn(
          'relative flex w-full flex-col bg-surface shadow-pop outline-none',
          mobile ? 'feuille-montee max-h-[86dvh] rounded-t-xl' : tiroir ? `h-dvh ${largeur}` : `max-h-[86dvh] rounded-xl ${largeur}`,
        )}
      >
        {/* En-tête — fixe */}
        <div {...(mobile ? balayage.poignee : {})} className="flex-none border-b border-rule">
          {mobile && <span className="mx-auto mt-2 block h-1 w-10 rounded-full bg-rule-strong" aria-hidden="true" />}
          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <h2 id={`${id}-titre`} className="text-panneau text-ink-900">
                {titre}
              </h2>
              {description && (
                <p id={`${id}-description`} className="mt-0.5 text-corps text-steel-500">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={demanderFermeture}
              aria-label="Fermer"
              className="-m-1 flex size-9 shrink-0 items-center justify-center rounded-md text-steel-500 transition-colors hover:bg-paper hover:text-ink-900 max-md:size-11"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Corps — seul à défiler */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={corpsRef} onScroll={mesurer} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <div>{children}</div>
          </div>
          {suite && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" aria-hidden="true" />
          )}
        </div>

        {/* Pied — fixe */}
        {pied && (
          <div className="flex flex-none justify-end gap-2 border-t border-rule px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:[&>*]:min-h-11 max-md:[&>*]:flex-1">
            {pied}
          </div>
        )}

        {confirmation && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-ink-900/30 p-5" role="alertdialog" aria-labelledby={`${id}-confirmation`}>
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-surface p-5 shadow-pop">
              <div>
                <p id={`${id}-confirmation`} className="text-panneau text-ink-900">
                  Abandonner la saisie ?
                </p>
                <p className="mt-1 text-corps text-steel-500">Les informations saisies dans « {titre} » seront perdues.</p>
              </div>
              <div className="flex justify-end gap-2 max-md:[&>*]:min-h-11 max-md:[&>*]:flex-1">
                <Button variant="secondary" autoFocus onClick={() => setConfirmation(false)}>
                  Continuer la saisie
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirmation(false);
                    onFermer();
                  }}
                >
                  Abandonner
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
