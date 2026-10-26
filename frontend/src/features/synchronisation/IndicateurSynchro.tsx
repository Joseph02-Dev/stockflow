import { useCallback, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronDown, CircleCheck, PackageCheck, PackageX, Receipt, RefreshCw, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePanneauFlottant } from '@/lib/usePanneauFlottant';
import { supprimerMouvementEnAttente, type EtatFile, type TypeMouvementHorsLigne } from '@/lib/mouvementsHorsLigne';
import type { StatutSynchronisation } from '@/lib/useSynchronisation';
import { dernierPrechargement, souscrirePrechargement } from '@/lib/prechargementHorsLigne';
import { useEtatBaseLocale } from '@/lib/useSynchronisationLocale';

const LARGEUR_PANNEAU = 380;

const TYPES: Record<TypeMouvementHorsLigne, { libelle: string; signe: string; teinte: string; Icone: typeof ArrowDown }> = {
  entree: { libelle: 'Entrée', signe: '+ ', teinte: 'var(--color-ok)', Icone: ArrowDown },
  sortie: { libelle: 'Sortie', signe: '− ', teinte: 'var(--color-action)', Icone: ArrowUp },
  transfert: { libelle: 'Transfert', signe: '', teinte: 'var(--color-accent)', Icone: ArrowLeftRight },
  vente: { libelle: 'Vente', signe: '', teinte: 'var(--color-ok)', Icone: Receipt },
  client: { libelle: 'Client', signe: '', teinte: 'var(--color-serie-4)', Icone: UserRound },
  perte: { libelle: 'Perte', signe: '− ', teinte: 'var(--color-rupture)', Icone: PackageX },
  reception: { libelle: 'Réception', signe: '', teinte: 'var(--color-ok)', Icone: PackageCheck },
};

/** Heure seule pour aujourd'hui, jour et heure au-delà. */
function moment(iso: string): string {
  const date = new Date(iso);
  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return heure;
  return `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${heure}`;
}

interface Props {
  statut: StatutSynchronisation;
  file: EtatFile;
  libelleReseau: string;
  synchroniser: () => Promise<void>;
  /** bureau : état + bouton dans la barre du haut ; mobile : pastille seule. */
  variante: 'bureau' | 'mobile';
  className?: string;
}

/**
 * Indicateur de synchronisation : état du réseau, compteur des mouvements
 * en attente, bouton « Synchroniser » et panneau de détail (file, dernier
 * refus du serveur avec Réessayer / Supprimer).
 */
export function IndicateurSynchro({ statut, file, libelleReseau, synchroniser, variante, className }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const ancreRef = useRef<HTMLDivElement>(null);
  const panneauRef = useRef<HTMLDivElement>(null);
  const idPanneau = useId();

  const prechargement = useSyncExternalStore(souscrirePrechargement, dernierPrechargement, dernierPrechargement);
  const baseLocale = useEtatBaseLocale();
  const horsLigne = statut === 'hors-ligne';
  const enCours = statut === 'synchronisation';
  const nombre = file.mouvements.length;
  const echec = file.echec && file.mouvements.some((m) => m.idLocal === file.echec?.idLocal) ? file.echec : null;

  const fermer = useCallback((rendreFocus = true) => {
    setOuvert(false);
    if (rendreFocus) ancreRef.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
  }, []);
  const largeur = useCallback(() => Math.min(LARGEUR_PANNEAU, window.innerWidth - 16), []);
  const hauteurNaturelle = useCallback(() => panneauRef.current?.scrollHeight ?? 0, []);
  const position = usePanneauFlottant({
    ouvert,
    ancreRef,
    panneauRef,
    fermer,
    positionner: true,
    largeur,
    hauteurNaturelle,
    aligner: 'droite',
    dependance: nombre,
  });

  function basculer() {
    if (ouvert) return fermer(false);
    setOuvert(true);
    // Le focus entre dans le panneau : Échap le referme, Tab parcourt ses actions.
    requestAnimationFrame(() => panneauRef.current?.focus());
  }

  function surTouche(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fermer();
    }
  }

  const compteur = nombre > 0 && (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-sur-couleur',
        echec ? 'bg-rupture' : 'bg-faible',
      )}
      aria-hidden="true"
    >
      {echec ? '!' : nombre}
    </span>
  );
  const resumeAccessible = [libelleReseau, echec ? 'une opération refusée' : nombre > 0 ? `${nombre} en attente` : '']
    .filter(Boolean)
    .join(', ');

  const panneau = ouvert && (
    <div
      ref={panneauRef}
      id={idPanneau}
      role="dialog"
      aria-label="Synchronisation"
      tabIndex={-1}
      onKeyDown={surTouche}
      style={
        position
          ? { left: position.gauche, width: position.largeur, top: position.haut, bottom: position.bas, maxHeight: position.hauteurMax }
          : { opacity: 0, left: 0, top: 0, width: LARGEUR_PANNEAU }
      }
      className="fixed z-[60] flex flex-col overflow-hidden rounded-[16px] border border-rule bg-surface shadow-pop outline-none!"
    >
      <div className="flex items-start gap-2.5 border-b border-rule px-4 pt-3.5 pb-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink-900">Synchronisation</p>
          <p className="text-meta text-steel-500">
            {file.derniere ? `Dernière synchronisation : ${moment(file.derniere)}` : 'Aucune synchronisation sur cet appareil'}
          </p>
        </div>
        <span
          className={cn(
            'ml-auto inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-meta font-semibold',
            horsLigne || echec ? 'bg-rupture-wash text-rupture' : nombre > 0 ? 'bg-faible-wash text-faible' : 'bg-ok-wash text-ok',
          )}
        >
          {horsLigne ? 'Hors ligne' : echec ? '1 refus' : nombre > 0 ? `${nombre} en attente` : 'À jour'}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5">
        {nombre === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-3 py-5 text-center text-corps text-steel-500">
            <CircleCheck className="size-6 text-ok" aria-hidden="true" />
            <span className="font-semibold text-ink-900">Rien en attente</span>
            Aucune opération à envoyer depuis cet appareil.
          </div>
        ) : (
          <ul>
            {file.mouvements.map((m) => {
              const type = TYPES[m.type];
              const refuse = echec?.idLocal === m.idLocal;
              const quantite = typeof m.corps.quantite === 'number' ? m.corps.quantite : null;
              return (
                <li
                  key={m.idLocal}
                  className={cn(
                    'flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-2 py-2.5',
                    refuse ? 'my-1 rounded-[12px] border border-rupture/35 bg-rupture-wash' : '[&+li]:border-t [&+li]:border-rule',
                  )}
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-[9px]"
                    style={{ color: type.teinte, background: `color-mix(in oklab, ${type.teinte} 14%, var(--color-surface))` }}
                    aria-hidden="true"
                  >
                    <type.Icone className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-corps font-semibold text-ink-900">
                      {type.libelle} · {m.resume}
                    </span>
                    {quantite !== null && (
                      <span className="text-meta text-steel-400">
                        Quantité {type.signe}
                        {quantite}
                      </span>
                    )}
                  </span>
                  <time dateTime={m.creeAt} className="font-mono text-meta text-steel-400">
                    {moment(m.creeAt)}
                  </time>
                  {refuse && (
                    <>
                      <p className="basis-full pl-[42px] text-meta text-rupture">
                        Refusé par le serveur : {echec?.message}
                        <span className="block text-steel-500">Les opérations suivantes attendent celle-ci.</span>
                      </p>
                      <div className="flex basis-full gap-1.5 pl-[42px]">
                        <button
                          type="button"
                          onClick={() => void synchroniser()}
                          disabled={horsLigne || enCours}
                          className="h-[30px] rounded-[8px] border border-rule-strong bg-surface px-2.5 text-meta font-semibold text-ink-900 hover:bg-survol disabled:opacity-50"
                        >
                          Réessayer
                        </button>
                        <button
                          type="button"
                          onClick={() => supprimerMouvementEnAttente(m.idLocal)}
                          className="h-[30px] rounded-[8px] border border-rule-strong bg-surface px-2.5 text-meta font-semibold text-rupture hover:bg-survol"
                        >
                          Supprimer
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-rule px-4 pt-3 pb-3.5">
        <button
          type="button"
          onClick={() => void synchroniser()}
          disabled={horsLigne || enCours}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[11px] bg-action text-[14px] font-semibold text-sur-couleur transition-colors hover:bg-action-dark disabled:bg-rule-strong disabled:text-steel-400"
        >
          <RefreshCw className={cn('size-[17px]', enCours && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
          {enCours ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
        <p className="text-meta text-steel-400">
          {horsLigne
            ? 'Pas de réseau : l’envoi repartira tout seul dès le retour de la connexion.'
            : 'Les opérations partent dans l’ordre où elles ont été saisies.'}
        </p>
        <p className="text-meta text-steel-400">
          {prechargement
            ? `Écrans disponibles hors ligne, avec les données de ${moment(prechargement)}.`
            : 'Écrans hors ligne : pas encore préparés sur cet appareil.'}
        </p>
        <p className="text-meta text-steel-400">
          {baseLocale.enCours
            ? 'Données de l’appareil : mise à jour en cours…'
            : baseLocale.derniereReussite
              ? `Données de l’appareil à jour de ${moment(baseLocale.derniereReussite)}.`
              : 'Données de l’appareil : pas encore recopiées.'}
        </p>
      </div>
    </div>
  );

  const declencheur =
    variante === 'bureau' ? (
      <div
        ref={ancreRef}
        className={cn('h-9 items-center overflow-hidden rounded-[10px] border border-rule-strong bg-surface', className)}
        role="group"
        aria-label="Synchronisation"
      >
        <button
          type="button"
          onClick={basculer}
          aria-haspopup="dialog"
          aria-expanded={ouvert}
          aria-controls={ouvert ? idPanneau : undefined}
          aria-label={`État : ${resumeAccessible}. Voir le détail`}
          className="inline-flex h-full items-center gap-1.5 px-2.5 text-meta font-semibold text-ink-900 transition-colors hover:bg-survol"
        >
          <span
            className={cn(
              'inline-flex size-2 shrink-0 rounded-full',
              horsLigne ? 'bg-rupture' : enCours ? 'animate-pulse bg-faible' : 'bg-reseau',
            )}
            aria-hidden="true"
          />
          <span role="status">{libelleReseau}</span>
          {compteur}
          <ChevronDown className="size-3.5 text-steel-500" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => void synchroniser()}
          disabled={horsLigne || enCours}
          title={horsLigne ? 'Indisponible hors ligne' : 'Synchroniser maintenant'}
          aria-label="Synchroniser maintenant"
          className="inline-flex h-full items-center gap-1.5 border-l border-rule px-2.5 text-meta font-semibold text-action transition-colors hover:bg-survol disabled:cursor-not-allowed disabled:text-steel-400 disabled:hover:bg-transparent"
        >
          <RefreshCw className={cn('size-4', enCours && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
          <span className="hidden min-[1440px]:inline">{enCours ? 'Synchronisation…' : 'Synchroniser'}</span>
        </button>
      </div>
    ) : (
      <div ref={ancreRef} className={className}>
        <button
          type="button"
          onClick={basculer}
          aria-haspopup="dialog"
          aria-expanded={ouvert}
          aria-controls={ouvert ? idPanneau : undefined}
          aria-label={`Synchronisation : ${resumeAccessible}`}
          className={cn(
            'relative inline-flex size-10 items-center justify-center rounded-md border border-rule bg-surface/60 transition-colors hover:bg-survol',
            horsLigne ? 'text-rupture' : 'text-ink-900',
          )}
        >
          <RefreshCw className={cn('size-[18px]', enCours && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
          {compteur && <span className="absolute -top-1.5 -right-1.5 rounded-full ring-2 ring-surface">{compteur}</span>}
        </button>
      </div>
    );

  return (
    <>
      {declencheur}
      {panneau && createPortal(panneau, document.body)}
    </>
  );
}
