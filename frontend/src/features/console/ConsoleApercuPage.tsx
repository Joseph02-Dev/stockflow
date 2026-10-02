import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, CircleOff, Clock, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { messageErreur } from '@/lib/api';
import { formatNombre, pluriel } from '@/lib/format';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { ErrorState, LoadingState } from '@/components/patterns/States';
import { apiConsole } from './api';
import { AnneauMouvements } from './AnneauMouvements';
import type { Segment } from './AnneauMouvements';

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

const COULEURS = ['--color-serie-1', '--color-serie-2', '--color-serie-3', '--color-serie-4', '--color-serie-5'];

function GroupeSurveillance({
  Icone,
  titre,
  explication,
  children,
  vide,
}: {
  Icone: typeof Clock;
  titre: string;
  explication: string;
  children: ReactNode[];
  vide: string;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-[26px] shrink-0 items-center justify-center rounded-sm bg-console-wash text-console">
          <Icone className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-corps font-semibold text-ink-900">
            {titre} <span className="font-normal text-steel-400">{children.length}</span>
          </p>
          <p className="text-meta text-steel-500">{explication}</p>
          {children.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">{children}</ul>
          ) : (
            <p className="mt-2 text-meta text-steel-400">{vide}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function LienEntreprise({ id, nom, meta }: { id: string; nom: string; meta: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-corps">
      <Link to={`/console/entreprises/${id}`} className="min-w-0 truncate text-ink-900 hover:text-console hover:underline">
        {nom}
      </Link>
      <span className="shrink-0 text-meta text-steel-500">{meta}</span>
    </li>
  );
}

export function ConsoleApercuPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['console', 'apercu'],
    queryFn: async () => (await apiConsole.get<Apercu>('/console/apercu')).data,
    // Chaque lecture est journalisée : on évite de relire à chaque retour.
    staleTime: 60_000,
  });

  if (isLoading) return <LoadingState />;
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
  const dateCourte = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : 'jamais');

  const mesures = [
    { libelle: 'Entreprises actives', valeur: kpi.entreprisesActives },
    { libelle: 'Suspendues', valeur: kpi.entreprisesSuspendues, alerte: kpi.entreprisesSuspendues > 0 },
    { libelle: 'Utilisateurs', valeur: kpi.utilisateurs },
    { libelle: 'Références suivies', valeur: kpi.references },
    { libelle: 'Mouvements 30 j', valeur: kpi.mouvements30j },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader titre="Vue d’ensemble" description="L’activité de toutes les entreprises de la plateforme." />

      <section
        aria-label="Mesures de la plateforme"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule shadow-card sm:grid-cols-3 lg:grid-cols-5"
      >
        {mesures.map((m) => (
          <div key={m.libelle} className="bg-surface px-5 py-4">
            <p className="text-meta text-steel-500">{m.libelle}</p>
            <p className={m.alerte ? 'mt-1 text-chiffre text-rupture' : 'mt-1 text-chiffre text-ink-900'}>
              {formatNombre(m.valeur)}
            </p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <PanneauEntete titre="Mouvements par entreprise" meta="30 derniers jours, 5 premières entreprises et les autres regroupées" />
          <div className="p-5">
            {kpi.mouvements30j === 0 ? (
              <p className="py-8 text-center text-corps text-steel-500">Aucun mouvement sur les 30 derniers jours.</p>
            ) : (
              <AnneauMouvements segments={segments} total={kpi.mouvements30j} />
            )}
          </div>
        </Card>

        <Card>
          <PanneauEntete titre="Entreprises à surveiller" meta="Signaux calculés sur l’activité réelle" />
          <div className="divide-y divide-rule">
            <GroupeSurveillance
              Icone={Clock}
              titre="Inactives"
              explication="Aucun mouvement ni connexion depuis plus de 14 jours"
              vide="Aucune entreprise inactive."
            >
              {aSurveiller.inactives.map((e) => (
                <LienEntreprise key={e.id} id={e.id} nom={e.nom} meta={`dernière activité ${dateCourte(e.derniereActivite)}`} />
              ))}
            </GroupeSurveillance>
            <GroupeSurveillance
              Icone={CircleOff}
              titre="Jamais démarrées"
              explication="Inscrites, mais aucun produit créé"
              vide="Toutes les entreprises ont créé au moins un produit."
            >
              {aSurveiller.jamaisDemarrees.map((e) => (
                <LienEntreprise key={e.id} id={e.id} nom={e.nom} meta={`inscrite le ${dateCourte(e.createdAt)}`} />
              ))}
            </GroupeSurveillance>
            <GroupeSurveillance
              Icone={TrendingUp}
              titre="Pic d’activité inhabituel"
              explication="7 derniers jours au-delà de 3 fois leur moyenne habituelle"
              vide="Aucun pic détecté."
            >
              {aSurveiller.picsActivite.map((e) => (
                <LienEntreprise key={e.id} id={e.id} nom={e.nom} meta={`${formatNombre(e.mouvements7j)} mouvements en 7 j`} />
              ))}
            </GroupeSurveillance>
            <GroupeSurveillance
              Icone={Activity}
              titre="Essai expiré"
              explication="Non suivi : la plateforme n’a pas encore de notion de période d’essai"
              vide="Indisponible en phase 1."
            >
              {[]}
            </GroupeSurveillance>
          </div>
        </Card>
      </div>
    </div>
  );
}
