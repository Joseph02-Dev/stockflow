import { useState, type CSSProperties } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Droplets,
  Ellipsis,
  Lightbulb,
  Lock,
  PackageX,
  PenLine,
  TrendingDown,
  TrendingUp,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { pageSuivante, urlPage } from '@/lib/pagination';
import { Pagination } from '@/components/patterns/Pagination';
import { usePagination } from '@/components/patterns/usePagination';
import { formatNombre, pluriel } from '@/lib/format';
import { gnf } from '@/lib/montant';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/useSession';
import { useEcranMobile } from '@/lib/useEcranMobile';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Card, PageHeader } from '@/components/patterns/Page';
import { Selecteur } from '@/components/ui/Selecteur';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { FormulaireCasse } from './FormulaireCasse';
import { MOTIFS, libelleMois } from './motifs';
import type { MotifPerte, MotifSynthese, Perte, SynthesePertes } from './types';
import './pertes.css';

/** Pictogramme de chaque motif, posé en coin de la vignette du produit. */
const ICONES: Record<MotifSynthese, LucideIcon> = {
  CASSE_MANUTENTION: PackageX,
  DEGAT_EAUX: Droplets,
  VOL: Lock,
  ERREUR_SAISIE: PenLine,
  AUTRE: Ellipsis,
  AVOIR_REFUSE: Undo2,
};

const FILTRES_MOTIF: MotifPerte[] = ['CASSE_MANUTENTION', 'DEGAT_EAUX', 'VOL', 'ERREUR_SAISIE', 'AUTRE'];

function Gnf({ clair }: { clair?: boolean }) {
  return <span className={cn('text-meta font-medium', clair ? 'text-white/55' : 'text-steel-400')}>GNF</span>;
}

function Bilan({ s }: { s: SynthesePertes }) {
  const hausse = (s.evolutionPourcentage ?? 0) > 0;
  const maxEvolution = Math.max(...s.evolution.map((e) => e.valeur), 1);
  return (
    <section
      className="pertes-bilan grid gap-5 rounded-xl px-5 py-6 text-white shadow-pop sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6"
      aria-labelledby="titre-pertes"
    >
      <span className="trame-grille pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-meta text-white/65">Perdu en {libelleMois(s.mois)}</p>
        <h2 id="titre-pertes" className="mt-1.5 font-display text-[2.25rem] leading-none font-semibold tracking-[-0.03em]">
          {formatNombre(s.total)} <Gnf clair />
        </h2>
        <p className="mt-2 text-corps text-white/70">
          {s.nombre} {pluriel('perte', s.nombre)}
          {s.nombre > 0 && ` · ${gnf(s.moyenne)} en moyenne`}
        </p>
        <dl className="mt-5 flex flex-wrap gap-2.5">
          <div className="flex flex-col-reverse rounded-lg border border-white/8 bg-white/6 px-3.5 py-2.5">
            <dt className="mt-1 text-meta text-white/60">de la valeur du stock</dt>
            <dd className="text-chiffre">{s.partDuStock.toLocaleString('fr-FR')} %</dd>
          </div>
          <div className="flex flex-col-reverse rounded-lg border border-white/8 bg-white/6 px-3.5 py-2.5">
            <dt className="mt-1 text-meta text-white/60">contre {libelleMois(s.evolution.at(-2)?.mois ?? s.mois)}</dt>
            <dd className={cn('flex items-center gap-1.5 text-chiffre', hausse ? 'text-rupture-vif' : 'text-reseau')}>
              {s.evolutionPourcentage === null ? (
                <span className="text-white">—</span>
              ) : (
                <>
                  {hausse ? (
                    <TrendingUp className="size-5" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="size-5" aria-hidden="true" />
                  )}
                  {hausse ? '+' : ''}
                  {Math.round(s.evolutionPourcentage).toLocaleString('fr-FR')} %
                </>
              )}
            </dd>
          </div>
        </dl>
      </div>
      <div
        className="pertes-mois flex h-[120px] items-end justify-between gap-2 self-end pt-5 sm:justify-start"
        role="img"
        aria-label={`Pertes des six derniers mois : ${s.evolution.map((e) => `${libelleMois(e.mois)}, ${gnf(e.valeur)}`).join(' ; ')}`}
      >
        {s.evolution.map((e, i) => {
          const actuel = i === s.evolution.length - 1;
          return (
            <div key={e.mois} className="flex h-full flex-col items-center justify-end gap-1.5" title={`${libelleMois(e.mois)} : ${gnf(e.valeur)}`}>
              <i
                className={cn('relative block w-[26px] rounded-t-[5px] rounded-b-[2px]', actuel ? 'bg-rupture-vif' : 'bg-white/18')}
                style={{ height: `${Math.max(6, (e.valeur / maxEvolution) * 80)}px`, '--n': i } as CSSProperties}
              />
              <span className={cn('text-[11px]', actuel ? 'font-semibold text-white' : 'text-white/55')}>
                {libelleMois(e.mois, true)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ParMotif({ s }: { s: SynthesePertes }) {
  // Une perte sans prix d'achat compte quand même : on garde tout motif déclaré.
  const motifs = s.parMotif.filter((m) => m.nombre > 0);
  return (
    <section
      className="flex flex-col gap-3.5 rounded-xl border border-rule bg-surface px-5 py-4.5 shadow-card"
      aria-labelledby="titre-motifs"
    >
      <div>
        <h2 id="titre-motifs" className="text-panneau text-ink-900">
          Par motif
        </h2>
        <p className="mt-0.5 text-meta text-steel-400">{libelleMois(s.mois)}, au prix d’achat</p>
      </div>
      {motifs.length === 0 ? (
        <p className="text-corps text-steel-500">Aucune perte ce mois-ci.</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {motifs.map((m) => (
            <li key={m.motif} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5">
              <span className="flex min-w-0 items-center gap-2 text-corps font-semibold text-ink-900">
                <i className={cn('size-[9px] shrink-0 rounded-[3px]', MOTIFS[m.motif].fond)} aria-hidden="true" />
                <span className="truncate">{MOTIFS[m.motif].court}</span>
                <span className="shrink-0 text-meta font-medium text-steel-400">
                  · {m.nombre} {pluriel('perte', m.nombre)}
                </span>
              </span>
              <span className="text-corps font-semibold whitespace-nowrap text-ink-900">{gnf(m.valeur)}</span>
              <span className="pertes-barre col-span-2 block h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden="true">
                <i className={cn('block h-full rounded-full', MOTIFS[m.motif].fond)} style={{ width: `${s.total > 0 ? (m.valeur / s.total) * 100 : 0}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const jourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

function libelleJour(date: Date): string {
  const hier = new Date();
  hier.setDate(hier.getDate() - 1);
  if (date.toDateString() === new Date().toDateString()) return 'Aujourd’hui';
  if (date.toDateString() === hier.toDateString()) return 'Hier';
  const texte = jourLong.format(date);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

export function PertesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const mobile = useEcranMobile();
  const estAdmin = useSession()?.utilisateur.role === 'ADMIN';
  const [declaration, setDeclaration] = useState(false);
  const [succes, setSucces] = useState<string | null>((location.state as { succes?: string } | null)?.succes ?? null);
  const [aAnnuler, setAAnnuler] = useState<Perte | null>(null);
  const [motifAnnulation, setMotifAnnulation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [motif, setMotif] = useState<MotifPerte | ''>('');
  const [emplacementId, setEmplacementId] = useState('');

  const synthese = useQuery({
    queryKey: ['pertes', 'synthese'],
    queryFn: async () => (await api.get<SynthesePertes>('/pertes/synthese')).data,
  });
  const emplacements = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<{ id: string; nom: string; chemin?: string }[]>('/emplacements')).data,
  });
  // Filtres appliqués par le serveur : la liste reste paginée et juste.
  const filtres = new URLSearchParams();
  if (motif) filtres.set('motif', motif);
  if (emplacementId) filtres.set('emplacementId', emplacementId);
  const liste = useInfiniteQuery({
    queryKey: ['pertes', 'liste', motif, emplacementId],
    queryFn: async ({ pageParam }) => (await api.get<Perte[]>(urlPage('/pertes', filtres, pageParam))).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (derniere) => pageSuivante(derniere),
  });
  const pertes = liste.data?.pages.flat() ?? [];
  const { visibles, ancre, pagination } = usePagination(pertes, {
    aPlus: liste.hasNextPage,
    chargerPlus: liste.fetchNextPage,
    reinitialiser: [motif, emplacementId],
  });

  const annuler = useMutation({
    mutationFn: async () => (await api.post<Perte>(`/pertes/${aAnnuler!.id}/annuler`, { motif: motifAnnulation })).data,
    onSuccess: (p) => {
      setSucces(`Casse annulée : ${p.quantite} ${p.produit.nom} ${p.quantite > 1 ? 'reviennent' : 'revient'} en stock.`);
      setAAnnuler(null);
      for (const cle of ['pertes', 'stock', 'mouvements', 'alertes', 'dashboard', 'lots']) queryClient.invalidateQueries({ queryKey: [cle] });
    },
    onError: (e) => setErreur(messageErreur(e, 'L’annulation a échoué.')),
  });

  const ouvrirDeclaration = () => {
    setSucces(null);
    // Au dépôt, sur téléphone : pleine page plutôt que fenêtre.
    if (mobile) navigate('/pertes/declarer');
    else setDeclaration(true);
  };

  // Total d'un jour sur tout ce qui est chargé, affiché seulement s'il est complet.
  const totauxJour = new Map<string, { nombre: number; montant: number }>();
  for (const p of pertes) {
    const cle = new Date(p.createdAt).toDateString();
    const t = totauxJour.get(cle) ?? { nombre: 0, montant: 0 };
    totauxJour.set(cle, { nombre: t.nombre + 1, montant: t.montant + (p.annuleAt ? 0 : (p.valeurTotale ?? 0)) });
  }
  const dernierJourCharge = pertes.length > 0 ? new Date(pertes[pertes.length - 1].createdAt).toDateString() : null;

  // Déclarations de la page groupées par jour.
  const jours: { cle: string; date: Date; pertes: Perte[] }[] = [];
  for (const p of visibles) {
    const date = new Date(p.createdAt);
    const dernier = jours.at(-1);
    if (dernier?.cle === date.toDateString()) dernier.pertes.push(p);
    else jours.push({ cle: date.toDateString(), date, pertes: [p] });
  }
  let rang = 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Ce que vous avez perdu"
        description="Chaque casse déclarée, ce qu’elle a coûté au prix d’achat, et où agir."
        action={
          <Button variant="danger" onClick={ouvrirDeclaration}>
            <PackageX className="size-4" aria-hidden="true" />
            Déclarer une casse
          </Button>
        }
      />

      {synthese.isLoading ? (
        <LoadingState variante="cartes" />
      ) : synthese.isError || !synthese.data ? (
        <ErrorState message={messageErreur(synthese.error)} onRetry={() => synthese.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <Bilan s={synthese.data} />
          <ParMotif s={synthese.data} />
        </div>
      )}

      {succes && <Alert variant="success">{succes}</Alert>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="-m-0.5 flex min-w-0 gap-1.5 overflow-x-auto p-0.5 [scrollbar-width:none]" role="group" aria-label="Motif">
              <button type="button" className="pertes-puce" aria-pressed={motif === ''} onClick={() => setMotif('')}>
                Tous
              </button>
              {FILTRES_MOTIF.map((m) => (
                <button key={m} type="button" className="pertes-puce" aria-pressed={motif === m} onClick={() => setMotif(m)}>
                  <i className={cn('size-[7px] rounded-full', MOTIFS[m].fond)} aria-hidden="true" />
                  {MOTIFS[m].court}
                </button>
              ))}
            </div>
            {(emplacements.data?.length ?? 0) > 1 && (
              <Selecteur
                id="filtre-emplacement-pertes"
                aria-label="Emplacement"
                className="shrink-0 sm:w-56"
                options={[
                  { valeur: '', libelle: 'Tous les emplacements' },
                  ...(emplacements.data ?? []).map((e) => ({ valeur: e.id, libelle: e.chemin ?? e.nom })),
                ]}
                value={emplacementId}
                onChange={setEmplacementId}
              />
            )}
          </div>

          {liste.isLoading ? (
            <Card>
              <LoadingState />
            </Card>
          ) : liste.isError ? (
            <Card>
              <ErrorState message={messageErreur(liste.error)} onRetry={() => liste.refetch()} />
            </Card>
          ) : pertes.length === 0 ? (
            <Card>
              {motif || emplacementId ? (
                <EmptyState
                  titre="Aucune perte pour ce filtre"
                  description="Choisissez un autre motif ou un autre emplacement."
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setMotif('');
                        setEmplacementId('');
                      }}
                    >
                      Voir toutes les pertes
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  titre="Aucune perte déclarée"
                  description="Un sac éventré, une palette mouillée : déclarez-la ici plutôt que de la corriger par un ajustement."
                />
              )}
            </Card>
          ) : (
            <div ref={ancre} className="flex scroll-mt-20 flex-col gap-3">
              {jours.map((jour) => {
                const totalJour = totauxJour.get(jour.cle) ?? { nombre: 0, montant: 0 };
                const complet = jour.cle !== dernierJourCharge || !liste.hasNextPage;
                return (
                  <section key={jour.cle} aria-label={libelleJour(jour.date)}>
                    <h3 className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
                      <span className="text-corps font-semibold text-ink-900">{libelleJour(jour.date)}</span>
                      {complet && (
                        <span className="text-meta text-steel-400">
                          {totalJour.nombre} {pluriel('déclaration', totalJour.nombre)} ·{' '}
                          <span className="font-semibold text-rupture">{gnf(totalJour.montant)}</span>
                        </span>
                      )}
                    </h3>
                    <Card>
                      <ul className="divide-y divide-rule">
                        {jour.pertes.map((p) => {
                          const Icone = ICONES[p.motifPerte];
                          return (
                            <li
                              key={p.id}
                              className={cn('pertes-ligne pertes-apparition', p.annuleAt && 'opacity-65')}
                              style={{ animationDelay: `${Math.min(rang++, 12) * 40}ms` }}
                            >
                              <span className="relative">
                                <Vignette nom={p.produit.nom} photoUrl={p.photoUrl ?? p.produit.photoUrl} taille={mobile ? 40 : 44} />
                                <span
                                  className={cn(
                                    'absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full text-white ring-2 ring-surface',
                                    MOTIFS[p.motifPerte].fond,
                                  )}
                                  aria-hidden="true"
                                >
                                  <Icone className="size-[11px]" />
                                </span>
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-corps font-semibold text-ink-900">
                                  {formatNombre(p.quantite)} × {p.produit.nom}
                                  {p.lot && <span className="font-mono text-meta font-normal text-steel-400"> · {p.lot.numero}</span>}
                                </p>
                                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-steel-400">
                                  <span
                                    className={cn('rounded-full px-2 py-0.5 font-semibold', MOTIFS[p.motifPerte].texte)}
                                    style={{ background: 'color-mix(in oklab, currentColor 13%, var(--color-surface))' }}
                                  >
                                    {MOTIFS[p.motifPerte].libelle}
                                  </span>
                                  <span>
                                    {p.emplacement.nom} · {p.utilisateur.nom} · {heure.format(new Date(p.createdAt))}
                                  </span>
                                </p>
                                {p.commentaire && (
                                  <p className="mt-1.5 rounded-r-md border-l-2 border-rule-strong bg-entete-tableau px-2.5 py-1.5 text-meta text-steel-500 italic">
                                    « {p.commentaire} »
                                  </p>
                                )}
                                {p.annuleAt && (
                                  <p className="mt-1 text-meta text-steel-500">
                                    Annulée par {p.annulePar?.nom} — {p.motifAnnulation}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {p.valeurTotale ? (
                                  <span
                                    className={cn(
                                      'font-display text-[15.5px] font-semibold whitespace-nowrap',
                                      p.annuleAt ? 'text-steel-400 line-through' : 'text-rupture',
                                    )}
                                  >
                                    −{formatNombre(p.valeurTotale)} <Gnf />
                                  </span>
                                ) : (
                                  <span className="text-meta whitespace-nowrap text-steel-400">Sans prix d’achat</span>
                                )}
                                {p.annuleAt ? (
                                  <Badge variant="neutral">Annulée</Badge>
                                ) : (
                                  estAdmin && (
                                    <Button
                                      variant="ghost"
                                      taille="sm"
                                      onClick={() => {
                                        setErreur(null);
                                        setMotifAnnulation('');
                                        setAAnnuler(p);
                                      }}
                                    >
                                      Annuler
                                    </Button>
                                  )
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </Card>
                  </section>
                );
              })}
              <Pagination etat={pagination} className="px-0.5" />
            </div>
          )}
        </div>

        <aside
          className="rounded-xl border border-rule bg-surface px-5 py-4.5 shadow-card"
          aria-labelledby="titre-depots"
        >
          <h2 id="titre-depots" className="text-panneau text-ink-900">
            Où ça se concentre
          </h2>
          {synthese.data && (
            <p className="mt-0.5 text-meta text-steel-400">Pertes de {libelleMois(synthese.data.mois)} par dépôt</p>
          )}
          {synthese.data?.analyse && (
            <p className="mt-3.5 flex gap-2.5 rounded-lg border border-faible/25 bg-faible-wash px-3.5 py-3 text-corps text-pretty text-ink-900">
              <Lightbulb className="mt-0.5 size-[18px] shrink-0 text-faible" aria-hidden="true" />
              <span>{synthese.data.analyse}</span>
            </p>
          )}
          {synthese.data?.parEmplacement.length === 0 && (
            <p className="mt-3.5 text-corps text-steel-500">Aucune perte ce mois-ci.</p>
          )}
          {synthese.data?.parEmplacement.map((e) => (
            <div key={e.emplacementId} className="mt-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-corps font-semibold text-ink-900">{e.nom}</span>
                <span className="shrink-0 text-corps font-semibold text-ink-900">{gnf(e.valeur)}</span>
              </div>
              <div className="mt-2 grid grid-cols-[52px_minmax(0,1fr)_40px] items-center gap-x-2.5 gap-y-1.5 text-meta">
                {[
                  { libelle: 'Pertes', part: e.partPertes, couleur: 'bg-perte-casse' },
                  { libelle: 'Stock', part: e.partStock, couleur: 'bg-perte-autre' },
                ].map((barre) => (
                  <div key={barre.libelle} className="contents">
                    <span className="text-steel-400">{barre.libelle}</span>
                    <span className="pertes-barre block h-[7px] overflow-hidden rounded-full bg-rule" aria-hidden="true">
                      <i className={cn('block h-full rounded-full', barre.couleur)} style={{ width: `${Math.min(100, barre.part)}%` }} />
                    </span>
                    <span className="text-right font-semibold text-steel-700">{barre.part.toLocaleString('fr-FR')} %</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {(synthese.data?.parEmplacement.length ?? 0) > 0 && (
            <p className="mt-4 border-t border-dashed border-rule pt-3 text-meta text-steel-400">
              Une part des pertes plus forte que la part du stock signale un dépôt à surveiller.
            </p>
          )}
        </aside>
      </div>

      {declaration && (
        <FormulaireCasse
          presentation="fenetre"
          onFermer={() => setDeclaration(false)}
          onDeclaree={(message) => {
            setSucces(message);
            setDeclaration(false);
          }}
        />
      )}

      <Modal
        ouvert={aAnnuler !== null}
        onFermer={() => setAAnnuler(null)}
        titre="Annuler cette casse ?"
        description="La quantité revient en stock par un mouvement inverse. La déclaration reste visible, marquée annulée."
        modifie={motifAnnulation.trim().length > 0}
        pied={
          <>
            <Button variant="secondary" onClick={() => setAAnnuler(null)}>
              Garder la déclaration
            </Button>
            <Button variant="danger" disabled={motifAnnulation.trim().length < 3} loading={annuler.isPending} onClick={() => annuler.mutate()}>
              Annuler la casse
            </Button>
          </>
        }
      >
        {aAnnuler && (
          <div className="flex flex-col gap-3">
            <p className="text-corps text-ink-900">
              {aAnnuler.quantite} × {aAnnuler.produit.nom} · {MOTIFS[aAnnuler.motifPerte].libelle} · déclarée par {aAnnuler.utilisateur.nom}
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-corps font-medium text-ink-900">Motif de l’annulation (obligatoire)</span>
              <textarea
                rows={3}
                value={motifAnnulation}
                onChange={(e) => setMotifAnnulation(e.target.value)}
                placeholder="Ex. sacs retrouvés intacts, erreur de produit…"
                className="champ rounded-md border border-rule-strong bg-surface-elevee px-3 py-2 text-corps text-ink-900"
              />
            </label>
            {erreur && <Alert variant="error">{erreur}</Alert>}
          </div>
        )}
      </Modal>
    </div>
  );
}
