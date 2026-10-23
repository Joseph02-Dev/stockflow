import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, Building2, CircleDashed, Clock, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { messageErreur } from '@/lib/api';
import { formatNombre, pluriel, tempsRelatif } from '@/lib/format';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { ErrorState, LoadingState } from '@/components/patterns/States';
import { apiConsole } from './api';
import { AnneauMouvements } from './AnneauMouvements';
import type { Segment } from './AnneauMouvements';
import { ACTIONS_JOURNAL } from './actionsJournal';
import type { EntreeJournal } from './actionsJournal';
import { PhraseJournal } from './PhraseJournal';
import type { Page } from './types';
import './console.css';

interface Apercu {
  kpi: {
    entreprisesActives: number;
    entreprisesSuspendues: number;
    utilisateurs: number;
    references: number;
    mouvements30j: number;
  };
  repartitionMouvements: {
    entreprises: { id: string; nom: string; mouvements: number }[];
    autres: { nombreEntreprises: number; mouvements: number };
  };
  aSurveiller: {
    inactives: { id: string; nom: string; derniereActivite: string | null }[];
    jamaisDemarrees: { id: string; nom: string; createdAt: string }[];
    picsActivite: { id: string; nom: string; mouvements7j: number }[];
  };
}

/** Palette de l'application, en commençant par le cuivre. */
const COULEURS = ['--color-action', '--color-serie-3', '--color-serie-4', '--color-serie-5', '--color-steel-500'];
const dateCourte = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
/** Entreprises listées par carte de surveillance ; les suivantes sont comptées. */
const LIGNES_SIGNAL = 4;

function Signal({
  Icone,
  couleur,
  titre,
  explication,
  nombre,
  vide,
  children,
}: {
  Icone: LucideIcon;
  couleur: string;
  titre: string;
  explication: string;
  nombre: number;
  vide: string;
  children: ReactNode[];
}) {
  return (
    <article className="console-signal" style={{ '--c': couleur } as CSSProperties}>
      <div className="flex items-center gap-2.5">
        <span className="console-pastille" aria-hidden="true">
          <Icone className="size-[17px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-corps font-semibold text-ink-900">{titre}</h2>
          <p className="text-meta text-steel-400">{explication}</p>
        </div>
        <span className="font-display text-[1.5rem] font-semibold" style={{ color: couleur }}>
          {nombre}
        </span>
      </div>
      {children.length === 0 ? (
        <p className="text-meta text-steel-400">{vide}</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {children.slice(0, LIGNES_SIGNAL)}
          {children.length > LIGNES_SIGNAL && (
            <li className="px-2 pt-1 text-meta text-steel-400">
              et {children.length - LIGNES_SIGNAL} {pluriel('autre', children.length - LIGNES_SIGNAL)}
            </li>
          )}
        </ul>
      )}
    </article>
  );
}

function LienEntreprise({ id, nom, meta }: { id: string; nom: string; meta: string }) {
  return (
    <li>
      <Link
        to={`/console/entreprises/${id}`}
        className="flex items-baseline justify-between gap-3 rounded-[9px] px-2 py-1.5 text-corps text-ink-900 transition-colors hover:bg-paper"
      >
        <span className="min-w-0 truncate">{nom}</span>
        <span className="shrink-0 text-meta text-steel-400">{meta}</span>
      </Link>
    </li>
  );
}

export function ConsoleApercuPage() {
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['console', 'apercu'],
    queryFn: async () => (await apiConsole.get<Apercu>('/console/apercu')).data,
    // Chaque lecture est journalisée : on évite de relire à chaque retour.
    staleTime: 60_000,
  });
  // Lecture du journal lui-même : elle n'est pas journalisée.
  const journal = useQuery({
    queryKey: ['console', 'journal', null, 'TOUTES', 'apercu'],
    queryFn: async () => (await apiConsole.get<Page<EntreeJournal>>('/console/journal?page=1&taille=5')).data,
  });

  if (isLoading) return <LoadingState variante="cartes" lignes={6} />;
  if (isError || !data) return <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />;

  const { kpi, repartitionMouvements: r, aSurveiller } = data;
  const segments: Segment[] = r.entreprises.map((e, i) => ({
    cle: e.id,
    libelle: e.nom,
    valeur: e.mouvements,
    couleur: `var(${COULEURS[i]})`,
  }));
  if (r.autres.nombreEntreprises > 0) {
    segments.push({
      cle: 'autres',
      libelle: `${r.autres.nombreEntreprises} ${pluriel('autre entreprise', r.autres.nombreEntreprises, 'autres entreprises')}`,
      valeur: r.autres.mouvements,
      couleur: 'var(--color-rule-strong)',
    });
  }

  const inscrites = kpi.entreprisesActives + kpi.entreprisesSuspendues;
  // « Actives » côté serveur = non suspendues ; en activité = ni inactives ni jamais démarrées.
  const enActivite = Math.max(0, kpi.entreprisesActives - aSurveiller.inactives.length - aSurveiller.jamaisDemarrees.length);
  const moyenne = enActivite > 0 ? Math.round(kpi.mouvements30j / enActivite) : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader titre="Vue d’ensemble" description="L’activité réelle de toutes les entreprises de la plateforme." />

      <section className="console-bandeau" aria-label="Plateforme">
        <div>
          <p className="console-sur">Entreprises en activité</p>
          <p className="mt-1.5 font-display text-[2.25rem] leading-tight font-semibold tracking-[-0.02em] max-sm:text-[1.875rem]">
            {formatNombre(enActivite)}{' '}
            <span className="font-sans text-[0.95rem] font-semibold text-white/60">
              sur {formatNombre(inscrites)} {pluriel('inscrite', inscrites)}
            </span>
          </p>
          <p className="text-corps text-white/65">
            {formatNombre(kpi.utilisateurs)} {pluriel('utilisateur', kpi.utilisateurs)} · {formatNombre(kpi.references)}{' '}
            {pluriel('référence suivie', kpi.references, 'références suivies')}
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <span className="console-puce">
              <i style={{ background: '#e8b33c' }} aria-hidden="true" />
              {aSurveiller.inactives.length} {pluriel('inactive', aSurveiller.inactives.length)}
            </span>
            <span className="console-puce">
              <i style={{ background: '#a0a3ab' }} aria-hidden="true" />
              {aSurveiller.jamaisDemarrees.length}{' '}
              {pluriel('jamais démarrée', aSurveiller.jamaisDemarrees.length, 'jamais démarrées')}
            </span>
            <span className="console-puce">
              <i style={{ background: '#f0705f' }} aria-hidden="true" />
              {kpi.entreprisesSuspendues} {pluriel('suspendue', kpi.entreprisesSuspendues)}
            </span>
          </div>
        </div>
        <div className="console-mini">
          <div>
            <ArrowLeftRight className="mb-1.5 size-[18px] text-console-clair" strokeWidth={1.75} aria-hidden="true" />
            <p className="font-display text-[1.375rem] font-semibold">{formatNombre(kpi.mouvements30j)}</p>
            <p className="text-meta text-white/60">mouvements sur 30 jours</p>
          </div>
          <div>
            <Building2 className="mb-1.5 size-[18px] text-console-clair" strokeWidth={1.75} aria-hidden="true" />
            <p className="font-display text-[1.375rem] font-semibold">{formatNombre(moyenne)}</p>
            <p className="text-meta text-white/60">en moyenne par entreprise en activité</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <Signal
          Icone={Clock}
          couleur="var(--color-faible)"
          titre="Inactives"
          explication="Rien depuis plus de 14 jours"
          nombre={aSurveiller.inactives.length}
          vide="Aucune entreprise inactive."
        >
          {aSurveiller.inactives.map((e) => (
            <LienEntreprise
              key={e.id}
              id={e.id}
              nom={e.nom}
              meta={e.derniereActivite ? tempsRelatif(e.derniereActivite, dataUpdatedAt) : 'jamais'}
            />
          ))}
        </Signal>
        <Signal
          Icone={CircleDashed}
          couleur="var(--color-steel-500)"
          titre="Jamais démarrées"
          explication="Inscrites, aucun produit"
          nombre={aSurveiller.jamaisDemarrees.length}
          vide="Toutes ont créé au moins un produit."
        >
          {aSurveiller.jamaisDemarrees.map((e) => (
            <LienEntreprise key={e.id} id={e.id} nom={e.nom} meta={`inscrite le ${dateCourte.format(new Date(e.createdAt))}`} />
          ))}
        </Signal>
        <Signal
          Icone={TrendingUp}
          couleur="var(--color-action)"
          titre="Pics d’activité"
          explication="7 jours au-delà de 3 × leur moyenne"
          nombre={aSurveiller.picsActivite.length}
          vide="Aucun pic détecté."
        >
          {aSurveiller.picsActivite.map((e) => (
            <LienEntreprise key={e.id} id={e.id} nom={e.nom} meta={`${formatNombre(e.mouvements7j)} mvts en 7 j`} />
          ))}
        </Signal>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <PanneauEntete titre="Mouvements par entreprise" meta="30 derniers jours" />
          <div className="p-5">
            {kpi.mouvements30j === 0 ? (
              <p className="py-8 text-center text-corps text-steel-500">Aucun mouvement sur les 30 derniers jours.</p>
            ) : (
              <AnneauMouvements segments={segments} total={kpi.mouvements30j} />
            )}
          </div>
        </Card>

        <Card>
          <PanneauEntete
            titre="Dernières actions"
            action={
              <Link to="/console/journal" className="inline-flex items-center gap-1 text-meta font-semibold text-action hover:underline">
                Tout le journal
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />
          {journal.isLoading ? (
            <LoadingState />
          ) : journal.isError || !journal.data ? (
            <ErrorState message={messageErreur(journal.error)} onRetry={() => journal.refetch()} />
          ) : journal.data.elements.length === 0 ? (
            <p className="px-5 py-8 text-center text-corps text-steel-500">Rien n’a encore été journalisé.</p>
          ) : (
            <ul className="py-1.5">
              {journal.data.elements.map((e) => {
                const a = ACTIONS_JOURNAL[e.action];
                return (
                  <li key={e.id} className="flex gap-3 px-5 py-2.5" style={{ '--c': a.couleur } as CSSProperties}>
                    <span className="console-pastille console-pastille-sm" aria-hidden="true">
                      <a.Icone className="size-[15px]" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <PhraseJournal entree={e} />
                      <p className="text-meta text-steel-400">{tempsRelatif(e.createdAt, journal.dataUpdatedAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
