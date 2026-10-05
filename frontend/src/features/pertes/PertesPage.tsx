import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { PackageX, TrendingDown, TrendingUp } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { pageSuivante, urlPage } from '@/lib/pagination';
import { formatNombre, pluriel } from '@/lib/format';
import { dateHeure, gnf } from '@/lib/montant';
import { cn } from '@/lib/cn';
import { useSession } from '@/lib/useSession';
import { useEcranMobile } from '@/lib/useEcranMobile';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { FormulaireCasse } from './FormulaireCasse';
import { MOTIFS, libelleMois } from './motifs';
import type { Perte, SynthesePertes } from './types';

function Bandeau({ s }: { s: SynthesePertes }) {
  const repartition = s.parMotif.filter((m) => m.valeur > 0);
  const hausse = (s.evolutionPourcentage ?? 0) > 0;
  const maxEvolution = Math.max(...s.evolution.map((e) => e.valeur), 1);
  return (
    <section className="bandeau-action flex flex-col gap-6 rounded-lg px-5 py-6 text-white sm:px-[26px]" aria-labelledby="titre-pertes">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <p className="text-meta text-white/65">Perdu en {libelleMois(s.mois)}</p>
            <h2 id="titre-pertes" className="mt-1 text-[32px] leading-[38px] font-semibold tracking-[-0.01em]">
              {gnf(s.total)}
            </h2>
            <p className="mt-1.5 text-corps text-white/65">
              {s.nombre} {pluriel('déclaration', s.nombre)}
              {s.nombre > 0 && ` · ${gnf(s.moyenne)} en moyenne`}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:flex sm:gap-8">
            <div className="flex flex-col-reverse border-l-2 border-rupture-vif pl-3">
              <dt className="text-meta text-white/65">de la valeur du stock</dt>
              <dd className="text-chiffre">{s.partDuStock.toLocaleString('fr-FR')} %</dd>
            </div>
            <div className="flex flex-col-reverse border-l-2 border-white/14 pl-3">
              <dt className="text-meta text-white/65">contre {libelleMois(s.evolution[4]?.mois ?? s.mois)}</dt>
              <dd className="flex items-center gap-1.5 text-chiffre">
                {s.evolutionPourcentage === null ? (
                  '—'
                ) : (
                  <>
                    {hausse ? <TrendingUp className="size-5 text-rupture-vif" aria-hidden="true" /> : <TrendingDown className="size-5 text-reseau" aria-hidden="true" />}
                    {hausse ? '+' : ''}
                    {Math.round(s.evolutionPourcentage).toLocaleString('fr-FR')} %
                  </>
                )}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex h-16 items-end gap-2" aria-label="Pertes des six derniers mois">
          {s.evolution.map((e, i) => (
            <div key={e.mois} className="flex flex-col items-center gap-1" title={`${libelleMois(e.mois)} : ${gnf(e.valeur)}`}>
              <span
                className={cn('w-6 rounded-[3px]', i === s.evolution.length - 1 ? 'bg-rupture-vif' : 'bg-white/20')}
                style={{ height: `${Math.max(4, (e.valeur / maxEvolution) * 44)}px` }}
              />
              <span className="text-[10px] text-white/55">{libelleMois(e.mois, true)}</span>
            </div>
          ))}
        </div>
      </div>

      {s.total > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label="Répartition des pertes par motif">
            {repartition.map((m) => (
              <span key={m.motif} className={MOTIFS[m.motif].fond} style={{ width: `${(m.valeur / s.total) * 100}%` }} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
            {repartition.map((m) => (
              <li key={m.motif} className="flex items-center gap-1.5 text-meta text-white/80">
                <span className={cn('size-2 rounded-full', MOTIFS[m.motif].fond)} aria-hidden="true" />
                {MOTIFS[m.motif].court} <span className="font-semibold text-white">{gnf(m.valeur)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
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

  const synthese = useQuery({
    queryKey: ['pertes', 'synthese'],
    queryFn: async () => (await api.get<SynthesePertes>('/pertes/synthese')).data,
  });
  const liste = useInfiniteQuery({
    queryKey: ['pertes', 'liste'],
    queryFn: async ({ pageParam }) => (await api.get<Perte[]>(urlPage('/pertes', new URLSearchParams(), pageParam))).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (derniere) => pageSuivante(derniere),
  });
  const pertes = liste.data?.pages.flat() ?? [];

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

  const maxEmplacement = Math.max(...(synthese.data?.parEmplacement.map((e) => e.valeur) ?? [1]), 1);

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
        <Bandeau s={synthese.data} />
      )}

      {succes && <Alert variant="success">{succes}</Alert>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <PanneauEntete titre="Déclarations récentes" meta="Nominatives et définitives : une erreur se corrige par annulation" />
          {liste.isLoading ? (
            <LoadingState />
          ) : liste.isError ? (
            <ErrorState message={messageErreur(liste.error)} onRetry={() => liste.refetch()} />
          ) : pertes.length === 0 ? (
            <EmptyState
              titre="Aucune perte déclarée"
              description="Un sac éventré, une palette mouillée : déclarez-la ici plutôt que de la corriger par un ajustement."
            />
          ) : (
            <>
              <ul className="divide-y divide-rule">
                {pertes.map((p) => (
                  <li key={p.id} className={cn('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5', p.annuleAt && 'opacity-70')}>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Vignette nom={p.produit.nom} photoUrl={p.photoUrl ?? p.produit.photoUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-corps font-medium text-ink-900">
                          {formatNombre(p.quantite)} × {p.produit.nom}
                          {p.lot && <span className="font-mono text-meta text-steel-500"> · {p.lot.numero}</span>}
                        </p>
                        <p className="truncate text-meta text-steel-500">
                          <span className={cn('font-medium', MOTIFS[p.motifPerte].texte)}>{MOTIFS[p.motifPerte].libelle}</span>
                          {' · '}
                          {p.emplacement.nom} · {p.utilisateur.nom} · {dateHeure(p.createdAt)}
                        </p>
                        {p.commentaire && <p className="truncate text-meta text-steel-500">« {p.commentaire} »</p>}
                        {p.annuleAt && (
                          <p className="text-meta text-steel-500">
                            Annulée par {p.annulePar?.nom} — {p.motifAnnulation}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-12 sm:pl-0">
                      <span className={cn('text-corps font-semibold', p.annuleAt ? 'text-steel-500 line-through' : 'text-rupture')}>
                        {gnf(p.valeurTotale ?? 0)}
                      </span>
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
                ))}
              </ul>
              {liste.hasNextPage && (
                <div className="flex justify-center border-t border-rule p-3">
                  <Button variant="secondary" loading={liste.isFetchingNextPage} onClick={() => liste.fetchNextPage()}>
                    Afficher plus
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>

        <Card>
          <PanneauEntete titre="Où ça se concentre" meta={synthese.data ? `Pertes de ${libelleMois(synthese.data.mois)} par dépôt` : undefined} />
          <div className="flex flex-col gap-4 p-5">
            {synthese.data?.analyse && <p className="text-corps text-pretty text-ink-900">{synthese.data.analyse}</p>}
            {synthese.data?.parEmplacement.length === 0 && <p className="text-corps text-steel-500">Aucune perte ce mois-ci.</p>}
            {synthese.data?.parEmplacement.map((e) => (
              <div key={e.emplacementId} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-corps font-medium text-ink-900">{e.nom}</span>
                  <span className="shrink-0 text-corps font-semibold text-ink-900">{gnf(e.valeur)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-paper">
                  <div className="h-full rounded-full bg-perte-casse" style={{ width: `${(e.valeur / maxEmplacement) * 100}%` }} />
                </div>
                <p className="text-meta text-steel-500">
                  {e.partPertes.toLocaleString('fr-FR')} % des pertes · {e.partStock.toLocaleString('fr-FR')} % du stock
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {declaration && (
        <FormulaireCasse
          presentation="fenetre"
          onFermer={() => setDeclaration(false)}
          onDeclaree={(declarees) => {
            const valeur = declarees.reduce((a, p) => a + (p.valeurTotale ?? 0), 0);
            const quantite = declarees.reduce((a, p) => a + p.quantite, 0);
            setSucces(`Perte déclarée : ${quantite} × ${declarees[0]?.produit.nom}, ${gnf(valeur)} au prix d’achat.`);
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
                className="rounded-[9px] border border-rule-strong bg-surface px-3 py-2 text-corps text-ink-900"
              />
            </label>
            {erreur && <Alert variant="error">{erreur}</Alert>}
          </div>
        )}
      </Modal>
    </div>
  );
}
