import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useEcranMobile } from '@/lib/useEcranMobile';
import { useBalayageFermeture } from '@/lib/useBalayageFermeture';

export interface OptionSelecteur {
  valeur: string;
  libelle: string;
  sousTitre?: string;
  /** Vignette, pastille ou icône affichée à gauche. */
  icone?: ReactNode;
  /** Titre de groupe (ex. famille d'une catégorie). */
  groupe?: string;
  desactive?: boolean;
}

interface Commun {
  label?: string;
  /** Libellé accessible quand aucun label n'est affiché. */
  'aria-label'?: string;
  options: OptionSelecteur[];
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Hauteur du champ fermé : 40 px par défaut, 32 px dans une barre compacte. */
  taille?: 'md' | 'sm';
  /** Textes de l'état vide : « Aucune référence trouvée … dans vos 428 références ». */
  vide?: { titre: string; nomPluriel: string };
  /** Création à la volée : pied de panneau et état vide. */
  creation?: {
    libelle: string;
    libelleDepuisRecherche?: (terme: string) => string;
    onCreer: (terme: string) => void;
  };
  onBlur?: () => void;
}

interface Simple extends Commun {
  multiple?: false;
  value: string;
  onChange: (valeur: string) => void;
}

interface Multiple extends Commun {
  multiple: true;
  value: string[];
  onChange: (valeurs: string[]) => void;
}

export type SelecteurProps = Simple | Multiple;

/** Au-delà de ce nombre d'entrées, un champ de filtrage s'affiche. */
const SEUIL_RECHERCHE = 8;
/** Écart entre le champ et le panneau, et marge minimale avec le bord de l'écran. */
const ECART = 6;
const MARGE = 8;
const HAUTEUR_LISTE = 268;

/** « Café moulu » → « cafe moulu » : filtrage insensible à la casse et aux accents. */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('fr');
}

interface Position {
  gauche: number;
  largeur: number;
  haut?: number;
  bas?: number;
  hauteurMax: number;
}

/**
 * Liste déroulante de l'application, à la place du <select> natif.
 *
 * - Ouverture au clic, ou à la frappe d'un caractère quand le champ a le
 *   focus (jamais au survol : inexistant sur mobile, et source
 *   d'ouvertures et de fermetures accidentelles).
 * - Filtrage à la frappe au-delà de 8 entrées, navigation ↑ ↓ Début Fin,
 *   validation Entrée, fermeture Échap ; raccourcis rappelés en pied.
 * - Panneau rendu dans un portail (document.body) : jamais coupé par une
 *   carte ou un tableau en overflow: hidden. Positionné en coordonnées
 *   d'écran (position: fixed) depuis le champ ; il s'ouvre vers le haut
 *   quand la place manque en dessous. Il suit le champ au défilement et
 *   au redimensionnement, et se ferme si le champ sort de l'écran.
 * - Sous 768 px : feuille montante, fermée par balayage ou par le fond.
 * - Motif ARIA « combobox » : listbox, options, aria-activedescendant ;
 *   le focus revient au champ à la fermeture.
 */
export function Selecteur(props: SelecteurProps) {
  const { label, options, placeholder = 'Choisir…', error, hint, disabled, className, taille = 'md', vide, creation } = props;
  const idGenere = useId();
  const id = props.id ?? idGenere;
  const idListe = `${id}-liste`;
  const mobile = useEcranMobile();

  const champRef = useRef<HTMLDivElement>(null);
  const panneauRef = useRef<HTMLDivElement>(null);
  const listeRef = useRef<HTMLUListElement>(null);
  const rechercheRef = useRef<HTMLInputElement>(null);

  const [ouvert, setOuvert] = useState(false);
  const [terme, setTerme] = useState('');
  const [actif, setActif] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);

  const selection = useMemo(
    () => new Set(props.multiple ? props.value : props.value ? [props.value] : []),
    [props.multiple, props.value],
  );
  const avecRecherche = options.length > SEUIL_RECHERCHE;

  const visibles = useMemo(() => {
    const t = normaliser(terme.trim());
    if (!t) return options;
    return options.filter((o) => normaliser(`${o.libelle} ${o.sousTitre ?? ''}`).includes(t));
  }, [options, terme]);

  const fermer = useCallback((rendreFocus = true) => {
    setOuvert(false);
    setTerme('');
    setPosition(null);
    if (rendreFocus) champRef.current?.focus();
  }, []);

  function ouvrir(saisie = '') {
    if (disabled) return;
    const filtre = avecRecherche ? saisie : '';
    const candidates = filtre ? options.filter((o) => normaliser(o.libelle).includes(normaliser(filtre))) : options;
    // Sans champ de filtrage, une lettre tapée active la première entrée qui commence par elle.
    const parLettre = !avecRecherche && saisie ? options.findIndex((o) => normaliser(o.libelle).startsWith(normaliser(saisie))) : -1;
    const dejaChoisie = candidates.findIndex((o) => selection.has(o.valeur));
    setTerme(filtre);
    setActif(parLettre >= 0 ? parLettre : Math.max(0, dejaChoisie));
    setOuvert(true);
  }

  function choisir(option: OptionSelecteur | undefined) {
    if (!option || option.desactive) return;
    if (props.multiple) {
      const suivantes = selection.has(option.valeur)
        ? props.value.filter((v) => v !== option.valeur)
        : [...props.value, option.valeur];
      props.onChange(suivantes);
      // Sélection multiple : le panneau reste ouvert pour enchaîner.
      rechercheRef.current?.focus();
      return;
    }
    props.onChange(option.valeur);
    fermer();
  }

  function retirer(valeur: string) {
    if (props.multiple) props.onChange(props.value.filter((v) => v !== valeur));
  }

  /** Prochaine entrée sélectionnable dans la direction donnée. */
  function deplacer(depart: number, pas: 1 | -1) {
    for (let i = depart; i >= 0 && i < visibles.length; i += pas) {
      if (!visibles[i].desactive) return i;
    }
    return actif;
  }

  function surTouche(e: KeyboardEvent) {
    if (!ouvert) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        ouvrir();
      } else if (e.key === 'Backspace' && props.multiple && props.value.length > 0) {
        retirer(props.value[props.value.length - 1]);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        ouvrir(e.key);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActif((a) => deplacer(Math.min(a + 1, visibles.length - 1), 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActif((a) => deplacer(Math.max(a - 1, 0), -1));
        break;
      case 'Home':
        e.preventDefault();
        setActif(deplacer(0, 1));
        break;
      case 'End':
        e.preventDefault();
        setActif(deplacer(visibles.length - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        choisir(visibles[actif]);
        break;
      case 'Escape':
        // preventDefault : la fenêtre qui contient le sélecteur ne se ferme pas avec lui.
        e.preventDefault();
        e.stopPropagation();
        fermer();
        break;
      case 'Tab':
        fermer(false);
        break;
      default:
        // Sans champ de filtrage : une lettre saute à la première entrée correspondante.
        if (!avecRecherche && e.key.length === 1) {
          const i = visibles.findIndex((o) => normaliser(o.libelle).startsWith(normaliser(e.key)));
          if (i >= 0) setActif(i);
        }
    }
  }

  // Position du panneau (bureau) : sous le champ, ou au-dessus faute de place.
  const placer = useCallback(() => {
    const champ = champRef.current;
    const panneau = panneauRef.current;
    if (!champ || !panneau) return;
    const r = champ.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) {
      fermer(false);
      return;
    }
    const liste = listeRef.current;
    const horsListe = panneau.offsetHeight - (liste?.offsetHeight ?? 0);
    const naturelle = horsListe + Math.min(liste?.scrollHeight ?? 0, HAUTEUR_LISTE);
    const dessous = window.innerHeight - r.bottom - ECART - MARGE;
    const dessus = r.top - ECART - MARGE;
    const versLeHaut = dessous < naturelle && dessus > dessous;
    const largeur = Math.max(r.width, 260);
    setPosition({
      gauche: Math.max(MARGE, Math.min(r.left, window.innerWidth - largeur - MARGE)),
      largeur,
      ...(versLeHaut ? { bas: window.innerHeight - r.top + ECART } : { haut: r.bottom + ECART }),
      hauteurMax: Math.max(160, versLeHaut ? dessus : dessous),
    });
  }, [fermer]);

  useLayoutEffect(() => {
    if (ouvert && !mobile) placer();
  }, [ouvert, mobile, placer, visibles.length]);

  useEffect(() => {
    if (!ouvert) return;
    // Sur mobile, pas de focus automatique : le clavier virtuel masquerait la liste.
    if (avecRecherche && !mobile) rechercheRef.current?.focus();
    function surDefilement(e: Event) {
      if (panneauRef.current?.contains(e.target as Node)) return;
      if (!mobile) placer();
    }
    function surPointeur(e: PointerEvent) {
      const cible = e.target as Node;
      if (champRef.current?.contains(cible) || panneauRef.current?.contains(cible)) return;
      fermer(false);
    }
    window.addEventListener('scroll', surDefilement, true);
    window.addEventListener('resize', surDefilement);
    document.addEventListener('pointerdown', surPointeur);
    return () => {
      window.removeEventListener('scroll', surDefilement, true);
      window.removeEventListener('resize', surDefilement);
      document.removeEventListener('pointerdown', surPointeur);
    };
  }, [ouvert, avecRecherche, mobile, placer, fermer]);

  // L'entrée active reste visible dans la liste.
  useEffect(() => {
    if (!ouvert) return;
    document.getElementById(`${id}-option-${actif}`)?.scrollIntoView({ block: 'nearest' });
  }, [ouvert, actif, id]);

  const balayage = useBalayageFermeture(() => fermer());

  const choisies = options.filter((o) => selection.has(o.valeur));
  const unique = !props.multiple ? choisies[0] : undefined;
  const idActif = ouvert && visibles[actif] ? `${id}-option-${actif}` : undefined;
  const termeAffiche = terme.trim();

  // Le focus clavier vit dans le champ de filtrage quand il existe (ou sur mobile), sinon sur le champ.
  const proprietesCombobox = {
    role: 'combobox' as const,
    'aria-expanded': ouvert,
    'aria-controls': idListe,
    'aria-haspopup': 'listbox' as const,
    'aria-activedescendant': idActif,
  };
  const focusDansRecherche = ouvert && avecRecherche && !mobile;

  const listeOptions = (
    <ul
      ref={listeRef}
      id={idListe}
      role="listbox"
      aria-multiselectable={props.multiple || undefined}
      aria-label={label ?? props['aria-label']}
      className={cn('min-h-0 flex-1 overflow-y-auto p-1', !mobile && 'max-h-[268px]')}
    >
      {visibles.map((option, i) => {
        const nouveauGroupe = option.groupe && option.groupe !== visibles[i - 1]?.groupe;
        const choisie = selection.has(option.valeur);
        return (
          <li key={option.valeur} role="presentation">
            {nouveauGroupe && (
              <p role="presentation" className="px-2.5 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-steel-400 uppercase">
                {option.groupe}
              </p>
            )}
            <div
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={choisie}
              aria-disabled={option.desactive || undefined}
              onPointerMove={() => !option.desactive && setActif(i)}
              onClick={() => choisir(option)}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-corps',
                mobile ? 'min-h-11 py-2' : 'min-h-9 py-1.5',
                i === actif && 'bg-action-wash',
                choisie ? 'bg-action-wash text-action' : 'text-ink-900',
                option.desactive && 'cursor-not-allowed opacity-50',
              )}
            >
              {option.icone && <span className="flex shrink-0 items-center">{option.icone}</span>}
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate', choisie && 'font-medium')}>{option.libelle}</span>
                {option.sousTitre && <span className="block truncate text-meta text-steel-500">{option.sousTitre}</span>}
              </span>
              {choisie && <Check className="size-4 shrink-0 text-action" aria-hidden="true" />}
            </div>
          </li>
        );
      })}
    </ul>
  );

  const etatVide = visibles.length === 0 && (
    <div className="flex flex-col items-start gap-2 px-4 py-4" role="status">
      <p className="text-corps font-medium text-ink-900">{vide?.titre ?? 'Aucun résultat'}</p>
      <p className="text-meta text-steel-500">
        {termeAffiche
          ? `Rien ne correspond à « ${termeAffiche} »${vide ? ` dans vos ${options.length} ${vide.nomPluriel}` : ''}.`
          : 'La liste est vide.'}
      </p>
      {creation && (
        <button
          type="button"
          onClick={() => {
            creation.onCreer(termeAffiche);
            fermer();
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-rule-strong bg-surface px-3 text-corps font-medium text-ink-900 hover:bg-paper"
        >
          <Plus className="size-4" aria-hidden="true" />
          {termeAffiche && creation.libelleDepuisRecherche ? creation.libelleDepuisRecherche(termeAffiche) : creation.libelle}
        </button>
      )}
    </div>
  );

  const panneau = ouvert && (
    <>
      {mobile && <div className="fixed inset-0 z-[60] bg-ink-900/40" onClick={() => fermer()} aria-hidden="true" />}
      <div
        ref={panneauRef}
        style={
          mobile
            ? balayage.style
            : position
              ? { left: position.gauche, width: position.largeur, top: position.haut, bottom: position.bas, maxHeight: position.hauteurMax }
              : { visibility: 'hidden', left: 0, top: 0 }
        }
        className={cn(
          'fixed z-[60] flex flex-col overflow-hidden bg-surface shadow-pop',
          mobile
            ? 'feuille-montee inset-x-0 bottom-0 max-h-[86dvh] rounded-t-xl pb-[env(safe-area-inset-bottom)]'
            : 'rounded-[12px] border border-rule',
        )}
      >
        {mobile && (
          <div {...balayage.poignee} className="flex flex-none flex-col items-center gap-2 px-4 pt-2 pb-1">
            <span className="h-1 w-10 rounded-full bg-rule-strong" aria-hidden="true" />
            {(label ?? props['aria-label']) && <p className="self-start text-panneau text-ink-900">{label ?? props['aria-label']}</p>}
          </div>
        )}
        {avecRecherche && (
          <div className="flex-none border-b border-rule p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
              <input
                ref={rechercheRef}
                {...proprietesCombobox}
                aria-label={`Filtrer : ${label ?? props['aria-label'] ?? ''}`}
                aria-autocomplete="list"
                value={terme}
                onChange={(e) => {
                  setTerme(e.target.value);
                  setActif(0);
                }}
                onKeyDown={surTouche}
                placeholder="Rechercher…"
                className={cn(
                  'w-full rounded-md border border-rule bg-paper pr-3 pl-8 text-corps text-ink-900 outline-none focus:border-action',
                  mobile ? 'h-11' : 'h-9',
                )}
              />
            </div>
          </div>
        )}
        {listeOptions}
        {etatVide}
        <div className="flex flex-none items-center gap-3 border-t border-rule bg-[#FAFBFC] px-3 py-2 text-meta text-steel-500">
          {!mobile && (
            <span className="flex flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
              {[
                ['↑↓', 'naviguer'],
                ['Entrée', 'choisir'],
                ['Échap', 'fermer'],
              ].map(([touche, action]) => (
                <span key={touche} className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-rule-strong bg-surface px-1 font-mono text-[11px] leading-4 text-steel-700">{touche}</kbd>
                  {action}
                </span>
              ))}
            </span>
          )}
          {creation && visibles.length > 0 && (
            <button
              type="button"
              onClick={() => {
                creation.onCreer(termeAffiche);
                fermer();
              }}
              className={cn('inline-flex items-center gap-1 font-medium text-action hover:underline', mobile && 'min-h-11')}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {creation.libelle}
            </button>
          )}
          {props.multiple && mobile && (
            <button type="button" onClick={() => fermer()} className="ml-auto min-h-11 font-medium text-action">
              Terminé
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label id={`${id}-libelle`} className="text-corps font-medium text-ink-900" onClick={() => champRef.current?.focus()}>
          {label}
        </label>
      )}
      <div
        ref={champRef}
        id={id}
        tabIndex={disabled ? -1 : 0}
        {...(focusDansRecherche ? { role: 'combobox', 'aria-expanded': true, 'aria-controls': idListe } : proprietesCombobox)}
        aria-label={label ? undefined : props['aria-label']}
        aria-labelledby={label ? `${id}-libelle` : undefined}
        aria-disabled={disabled || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-erreur` : hint ? `${id}-aide` : undefined}
        onClick={() => (ouvert ? fermer() : ouvrir())}
        onKeyDown={surTouche}
        onBlur={props.onBlur}
        className={cn(
          'flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-[9px] border bg-surface px-3 text-left text-corps text-ink-900 transition-[border-color,box-shadow,background-color] outline-none',
          taille === 'md' ? 'min-h-10' : 'min-h-8',
          mobile && 'min-h-11',
          'hover:border-steel-400 hover:bg-[#FCFCFD] focus-visible:border-action focus-visible:shadow-[0_0_0_3px_rgba(34,66,199,.12)]',
          ouvert && 'border-action shadow-[0_0_0_3px_rgba(34,66,199,.12)]',
          error ? 'border-rupture' : !ouvert && 'border-rule-strong',
          disabled && 'pointer-events-none cursor-not-allowed opacity-50',
        )}
      >
        {props.multiple ? (
          <span className="flex min-w-0 flex-1 flex-wrap gap-1 py-1">
            {choisies.length === 0 && <span className="truncate text-steel-400">{placeholder}</span>}
            {choisies.map((o) => (
              <span key={o.valeur} className="inline-flex max-w-full items-center gap-1 rounded-[6px] bg-action-wash py-0.5 pr-1 pl-2 text-meta font-medium text-action">
                <span className="truncate">{o.libelle}</span>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Retirer ${o.libelle}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    retirer(o.valeur);
                  }}
                  className="rounded p-0.5 hover:bg-action/10"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {unique?.icone && <span className="flex shrink-0 items-center">{unique.icone}</span>}
            <span className={cn('truncate', !unique && 'text-steel-400')}>{unique?.libelle ?? placeholder}</span>
          </span>
        )}
        <ChevronDown className={cn('size-4 shrink-0 text-steel-400 transition-transform', ouvert && 'rotate-180')} aria-hidden="true" />
      </div>
      {error ? (
        <p id={`${id}-erreur`} className="text-meta text-rupture">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-aide`} className="text-meta text-steel-500">
            {hint}
          </p>
        )
      )}
      {panneau && createPortal(panneau, document.body)}
    </div>
  );
}
