import { useState, useSyncExternalStore } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { pageSuivante, urlPage } from '@/lib/pagination';
import { Button } from '@/components/ui/Button';
import { gnf } from '@/lib/montant';
import { formatNombre, pluriel } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { etatFile, souscrireFile } from '@/lib/mouvementsHorsLigne';
import { Selecteur } from '@/components/ui/Selecteur';
import { Card, PageHeader } from '@/components/patterns/Page';
import { Compteur } from '@/components/patterns/Compteur';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { MODES } from './modes';
import type { ModePaiement, VenteResume } from './types';
import { debutPeriode } from '@/lib/periode';
import './ventes.css';

const LIEN_NOUVELLE = boutonClasses('primary');

/** Résumé des 7 derniers jours : même requête (et même cache) que l'écran Statistiques. */
interface Resume7Jours {
  chiffreAffaires: { valeur: number | null; precedent: number | null };
  ventes: { valeur: number | null; precedent: number | null };
  panierMoyen: { valeur: number | null; precedent: number | null };
  ventesParMode: { mode: string; montant: number }[];
}

/** Résumé de l'écran Créances (même requête, même cache). */
interface ResumeCreances {
  resume: { totalDu: number; nombreClients: number; montantEnRetard: number };
}

function Variation({ valeur, precedent }: { valeur: number | null; precedent: number | null }) {
  if (valeur === null || !precedent) return <span className="text-meta text-steel-400">vs 7 jours précédents</span>;
  const ecart = Math.round(((valeur - precedent) / precedent) * 100);
  const hausse = ecart >= 0;
  const Icone = hausse ? TrendingUp : TrendingDown;
  return (
    <span className={cn('inline-flex items-center gap-1 text-meta font-semibold', hausse ? 'text-ok' : 'text-rupture')}>
      <Icone className="size-3.5 shrink-0" aria-hidden="true" />
      {hausse ? '+' : '−'}
      {Math.abs(ecart)} %<span className="hidden font-normal text-steel-400 sm:inline"> vs 7 jours précédents</span>
    </span>
  );
}

/**
 * Ventes hors ligne : celles qui attendent encore l'envoi depuis cet
 * appareil, et celles déjà envoyées mais vendues sans stock enregistré.
 */
function AvisHorsLigne() {
  const file = useSyncExternalStore(souscrireFile, etatFile, etatFile);
  const enAttente = file.mouvements.filter((m) => m.type === 'vente').length;
  const aRegulariser = useQuery({
    queryKey: ['ventes', 'a-regulariser'],
    queryFn: async () => (await api.get<VenteResume[]>('/ventes?aRegulariser=true&limite=50')).data,
  });
  const liste = aRegulariser.data ?? [];
  if (enAttente === 0 && liste.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {enAttente > 0 && (
        <Alert variant="info">
          {enAttente} {pluriel('vente', enAttente)} {enAttente > 1 ? 'saisies' : 'saisie'} hors ligne sur cet appareil{' '}
          {enAttente > 1 ? 'attendent' : 'attend'} le retour du réseau : {enAttente > 1 ? 'elles recevront leur' : 'elle recevra son'}{' '}
          numéro à la synchronisation.
        </Alert>
      )}
      {liste.length > 0 && (
        <Alert variant="warning">
          <strong>
            {liste.length} {pluriel('vente', liste.length)} à régulariser
          </strong>{' '}
          : {liste.length > 1 ? 'vendues' : 'vendue'} hors ligne sans stock enregistré. Enregistrez l’entrée manquante,
          puis ouvrez la vente pour la régulariser :{' '}
          {liste.slice(0, 6).map((v, i) => (
            <span key={v.id}>
              {i > 0 && ', '}
              <Link to={`/ventes/${v.id}`} className="font-mono font-medium underline underline-offset-2">
                {v.numero}
              </Link>
            </span>
          ))}
          {liste.length > 6 && '…'}
        </Alert>
      )}
    </div>
  );
}

function ResumeVentes() {
  const { data } = useQuery({
    queryKey: ['statistiques', '7j'],
    queryFn: async () => (await api.get<Resume7Jours>('/statistiques', { params: { periode: '7j' } })).data,
  });
  const creances = useQuery({
    queryKey: ['creances'],
    queryFn: async () => (await api.get<ResumeCreances>('/creances')).data,
  });
  // Indicatif : la liste reste lisible si le résumé n'arrive pas.
  if (!data) return null;
  const totalModes = data.ventesParMode.reduce((n, m) => n + m.montant, 0);
  const mesures = [
    { libelle: "Chiffre d'affaires", c: data.chiffreAffaires, unite: 'GNF', point: 'bg-action' },
    { libelle: 'Ventes', c: data.ventes, unite: pluriel('ticket', data.ventes.valeur ?? 0), point: 'bg-[#2f6fb3]' },
    { libelle: 'Panier moyen', c: data.panierMoyen, unite: 'GNF', point: 'bg-accent' },
  ];
  const du = creances.data?.resume;

  return (
    <>
      <section aria-label="Les 7 derniers jours" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {mesures.map(({ libelle, c, unite, point }) => (
          <div key={libelle} className="ventes-mesure">
            <p className="flex items-center gap-2 text-meta font-semibold text-steel-500">
              <i className={cn('size-2 shrink-0 rounded-full', point)} aria-hidden="true" />
              <span>
                {libelle}
                <span className="hidden sm:inline"> · 7 jours</span>
              </span>
            </p>
            <p className="text-chiffre text-ink-900">
              {c.valeur === null ? (
                '—'
              ) : (
                <>
                  <Compteur valeur={c.valeur} format={formatNombre} />{' '}
                  <span className="text-corps font-medium text-steel-400">{unite}</span>
                </>
              )}
            </p>
            <Variation valeur={c.valeur} precedent={c.precedent} />
          </div>
        ))}
        {du && (
          <Link to="/creances" className="ventes-mesure ventes-du">
            <p className="flex items-center gap-2 text-meta font-semibold text-steel-500">
              <i className="size-2 shrink-0 rounded-full bg-faible" aria-hidden="true" />
              Reste à encaisser
            </p>
            <p className="text-chiffre text-ink-900">
              <Compteur valeur={du.totalDu} format={formatNombre} />{' '}
              <span className="text-corps font-medium text-steel-400">GNF</span>
            </p>
            <p className="text-meta text-steel-500">
              {du.nombreClients} {pluriel('client', du.nombreClients)}
              {du.montantEnRetard > 0 && (
                <span className="font-semibold text-rupture"> · {gnf(du.montantEnRetard)} en retard</span>
              )}
            </p>
            <span className="text-meta font-semibold text-action">Voir les créances →</span>
          </Link>
        )}
      </section>

      <section
        aria-label="Encaissé par mode sur 7 jours"
        className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-rule bg-surface px-4 py-3.5 shadow-card sm:px-5"
      >
        <p className="text-meta font-semibold whitespace-nowrap text-steel-500">Encaissé par mode · 7 jours</p>
        {totalModes === 0 ? (
          <p className="text-corps text-steel-400">Aucune vente sur la période.</p>
        ) : (
          <>
            <div className="ventes-repartition" aria-hidden="true">
              {data.ventesParMode.map((m) => (
                <span
                  key={m.mode}
                  className={MODES[m.mode as ModePaiement]?.point ?? 'bg-steel-400'}
                  style={{ width: `${(m.montant / totalModes) * 100}%` }}
                />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {data.ventesParMode.map((m) => (
                <li key={m.mode} className="flex items-center gap-1.5 text-meta text-steel-500">
                  <span
                    className={cn('size-2 rounded-full', MODES[m.mode as ModePaiement]?.point ?? 'bg-steel-400')}
                    aria-hidden="true"
                  />
                  {MODES[m.mode as ModePaiement]?.libelle ?? m.mode}
                  <span className="font-semibold text-ink-900">{Math.round((m.montant / totalModes) * 100)} %</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

const PERIODES = [
  { cle: 'jour', libelle: 'Aujourd’hui', jours: 1 },
  { cle: '7j', libelle: '7 jours', jours: 7 },
  { cle: '30j', libelle: '30 jours', jours: 30 },
  { cle: 'tout', libelle: 'Tout', jours: null },
] as const;
type ClePeriode = (typeof PERIODES)[number]['cle'];

/** Minuit local, `jours - 1` jours avant aujourd'hui : « 7 jours » = aujourd'hui et les 6 précédents. */
const jourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const cleJour = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** « Aujourd'hui », « Hier » ou « Mardi 14 octobre ». */
function libelleJour(date: Date, maintenant: Date) {
  const hier = new Date(maintenant);
  hier.setDate(hier.getDate() - 1);
  if (cleJour(date) === cleJour(maintenant)) return 'Aujourd’hui';
  if (cleJour(date) === cleJour(hier)) return 'Hier';
  const texte = jourLong.format(date);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

function Statut({ vente }: { vente: VenteResume }) {
  if (vente.statut === 'ANNULEE') return <Badge variant="rupture">Annulée</Badge>;
  if (vente.aRegulariser) return <Badge variant="faible">À régulariser</Badge>;
  if (vente.resteDu > 0) return <Badge variant="faible">Reste {formatNombre(vente.resteDu)}</Badge>;
  return <Badge variant="ok">Réglée</Badge>;
}

/** Vente à crédit : part déjà payée ; sinon le mode de paiement, en clair. */
function Paiement({ vente }: { vente: VenteResume }) {
  if (vente.modePaiement !== 'CREDIT' || vente.statut === 'ANNULEE' || vente.total <= 0) {
    return <span className="text-meta text-steel-500">{MODES[vente.modePaiement].libelle}</span>;
  }
  const part = Math.min(100, Math.round((vente.paye / vente.total) * 100));
  return (
    <div>
      <p className="mb-1.5 flex justify-between gap-2 text-meta whitespace-nowrap text-steel-400">
        <span>
          Payé <span className="font-semibold text-ink-900">{formatNombre(vente.paye)}</span>
        </span>
        <span>{part} %</span>
      </p>
      <span className="block h-[5px] overflow-hidden rounded-full bg-rule" aria-hidden="true">
        <span
          className={cn('block h-full rounded-full', vente.resteDu > 0 ? 'bg-faible' : 'bg-ok')}
          style={{ width: `${part}%` }}
        />
      </span>
    </div>
  );
}

export function VentesPage() {
  const [periode, setPeriode] = useState<ClePeriode>('7j');
  const [emplacementId, setEmplacementId] = useState('');
  const [maintenant] = useState(() => new Date());

  const emplacements = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<{ id: string; nom: string; chemin?: string }[]>('/emplacements')).data,
  });

  const jours = PERIODES.find((p) => p.cle === periode)?.jours ?? null;
  const filtres = new URLSearchParams();
  if (jours !== null) filtres.set('du', debutPeriode(jours));
  if (emplacementId) filtres.set('emplacementId', emplacementId);

  // Historique par pages de 50 (« Afficher plus ») : jamais toutes les ventes d'un coup.
  const { data, isLoading, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery(
    {
      queryKey: ['ventes', 'liste', periode, emplacementId],
      queryFn: async ({ pageParam }) => (await api.get<VenteResume[]>(urlPage('/ventes', filtres, pageParam))).data,
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (derniere) => pageSuivante(derniere),
    },
  );
  const ventes = data?.pages.flat() ?? [];

  // Ventes groupées par jour ; le total d'un jour n'est affiché que s'il est complet.
  const groupes: { cle: string; date: Date; ventes: VenteResume[] }[] = [];
  for (const v of ventes) {
    const date = new Date(v.createdAt);
    const dernier = groupes.at(-1);
    if (dernier?.cle === cleJour(date)) dernier.ventes.push(v);
    else groupes.push({ cle: cleJour(date), date, ventes: [v] });
  }

  const filtreActif = periode !== 'tout' || emplacementId !== '';
  let rang = 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titre="Ventes"
        description="Chaque vente, son client, ce qui a été payé et ce qui reste dû."
        action={
          <Link to="/ventes/nouvelle" className={LIEN_NOUVELLE}>
            <Plus className="size-4" aria-hidden="true" />
            Nouvelle vente
          </Link>
        }
      />

      <ResumeVentes />
      <AvisHorsLigne />

      <div className="mt-2 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="ventes-periode" role="group" aria-label="Période">
          {PERIODES.map((p) => (
            <button key={p.cle} type="button" aria-pressed={periode === p.cle} onClick={() => setPeriode(p.cle)}>
              {p.libelle}
            </button>
          ))}
        </div>
        {(emplacements.data?.length ?? 0) > 1 && (
          <Selecteur
            id="filtre-emplacement-ventes"
            aria-label="Emplacement"
            className="sm:w-60"
            options={[
              { valeur: '', libelle: 'Tous les emplacements' },
              ...(emplacements.data ?? []).map((e) => ({ valeur: e.id, libelle: e.chemin ?? e.nom })),
            ]}
            value={emplacementId}
            onChange={setEmplacementId}
          />
        )}
      </div>

      {isLoading ? (
        <Card>
          <LoadingState />
        </Card>
      ) : isError ? (
        <Card>
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        </Card>
      ) : ventes.length === 0 ? (
        <Card>
          {filtreActif ? (
            <EmptyState
              titre="Aucune vente sur cette période"
              description="Choisissez une période plus longue ou un autre emplacement."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPeriode('tout');
                    setEmplacementId('');
                  }}
                >
                  Voir toutes les ventes
                </Button>
              }
            />
          ) : (
            <EmptyState
              titre="Aucune vente"
              description="Enregistrez votre première vente : le stock et la dette du client se mettent à jour d’eux-mêmes."
              action={
                <Link to="/ventes/nouvelle" className={LIEN_NOUVELLE}>
                  Nouvelle vente
                </Link>
              }
            />
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {groupes.map((groupe, index) => {
            const valides = groupe.ventes.filter((v) => v.statut !== 'ANNULEE');
            const complet = index < groupes.length - 1 || !hasNextPage;
            return (
              <section key={groupe.cle} aria-label={libelleJour(groupe.date, maintenant)}>
                <h2 className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
                  <span className="text-corps font-semibold text-ink-900">{libelleJour(groupe.date, maintenant)}</span>
                  {complet && (
                    <span className="text-meta text-steel-400">
                      {valides.length} {pluriel('vente', valides.length)} ·{' '}
                      <span className="font-semibold text-ink-900">
                        {gnf(valides.reduce((total, v) => total + v.total, 0))}
                      </span>
                    </span>
                  )}
                </h2>
                <Card>
                  <ul className="divide-y divide-rule">
                    {groupe.ventes.map((v) => {
                      const { Icone, libelle, teinte } = MODES[v.modePaiement];
                      const annulee = v.statut === 'ANNULEE';
                      return (
                        <li key={v.id}>
                          <Link
                            to={`/ventes/${v.id}`}
                            className="ventes-ligne ventes-apparition group"
                            style={{ animationDelay: `${Math.min(rang++, 12) * 35}ms` }}
                          >
                            <span className="text-right font-mono text-meta text-steel-400">
                              {heure.format(new Date(v.createdAt))}
                            </span>
                            <span
                              className={cn('ventes-mode', teinte, annulee && 'opacity-60 grayscale')}
                              title={libelle}
                              aria-hidden="true"
                            >
                              <Icone className="size-[18px]" />
                            </span>
                            <span className="min-w-0">
                              <span
                                className={cn(
                                  'block truncate text-corps font-semibold',
                                  annulee ? 'text-steel-400 line-through' : 'text-ink-900',
                                )}
                              >
                                {v.client?.nom ?? 'Client de passage'}
                              </span>
                              <span className="block truncate text-meta text-steel-400">
                                <span className="ventes-heure-mobile font-mono">
                                  {heure.format(new Date(v.createdAt))} ·{' '}
                                </span>
                                <span className="font-mono text-steel-500">{v.numero}</span> · {v.nombreLignes}{' '}
                                {pluriel('article', v.nombreLignes)} · {v.emplacement.nom}
                              </span>
                            </span>
                            <Paiement vente={v} />
                            <span className="flex flex-col items-end gap-1">
                              <span
                                className={cn(
                                  'font-display text-[15.5px] font-semibold tracking-[-0.01em] whitespace-nowrap',
                                  annulee ? 'text-steel-400 line-through' : 'text-ink-900',
                                )}
                              >
                                {formatNombre(v.total)}{' '}
                                <span className="font-sans text-meta font-medium text-steel-400">GNF</span>
                              </span>
                              <Statut vente={v} />
                            </span>
                            <ChevronRight
                              className="size-4 text-steel-400 transition-transform duration-200 ease-sortie group-hover:translate-x-0.5 group-hover:text-ink-900"
                              aria-hidden="true"
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </section>
            );
          })}
          {hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
                Afficher plus de ventes
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
