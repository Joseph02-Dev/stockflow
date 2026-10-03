import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarX2, Tag } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { pageSuivante, urlPage } from '@/lib/pagination';
import { formatNombre, pluriel } from '@/lib/format';
import { gnf } from '@/lib/montant';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState, Squelette } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { TRANCHES, datePeremption, libelleJours } from './presentation';
import type { LotPeremption, ResumePeremptions, Tranche } from './types';

/** Remise proposée pour brader un lot proche de sa péremption (modifiable dans la vente). */
const REMISE_BRADAGE = 20;

function lienBrader(lot: LotPeremption): string {
  const p = new URLSearchParams({
    produit: lot.produit.id,
    emplacement: lot.emplacement.id,
    quantite: String(lot.quantite),
    remise: String(REMISE_BRADAGE),
    lot: lot.numero,
  });
  return `/ventes/nouvelle?${p.toString()}`;
}

export function PeremptionsPage() {
  const queryClient = useQueryClient();
  const [filtre, setFiltre] = useState<Tranche | null>(null);
  const [aSortir, setASortir] = useState<LotPeremption | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  // Même clé que la pastille de la navigation : une sortie met les deux à jour.
  const resume = useQuery({
    queryKey: ['peremptions', 'resume'],
    queryFn: async () => (await api.get<ResumePeremptions>('/peremptions')).data,
  });

  const lots = useInfiniteQuery({
    queryKey: ['peremptions', 'lots', filtre],
    queryFn: async ({ pageParam }) => {
      const filtres = new URLSearchParams(filtre ? { tranche: filtre } : {});
      return (await api.get<LotPeremption[]>(urlPage('/peremptions/lots', filtres, pageParam))).data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (derniere) => pageSuivante(derniere),
  });
  const liste = lots.data?.pages.flat() ?? [];

  const sortir = useMutation({
    mutationFn: async (lot: LotPeremption) => api.post(`/peremptions/lots/${lot.id}/sortir`),
    onSuccess: (_, lot) => {
      setSucces(`Lot ${lot.numero} sorti du stock : ${lot.quantite} ${lot.produit.nom} enregistrés comme périmés.`);
      setASortir(null);
      for (const cle of ['peremptions', 'stock', 'mouvements', 'alertes', 'dashboard', 'lots']) {
        queryClient.invalidateQueries({ queryKey: [cle] });
      }
    },
    onError: (e) => setErreur(messageErreur(e, 'La sortie du lot a échoué.')),
  });

  const parTranche = new Map(resume.data?.tranches.map((t) => [t.tranche, t]));
  const valeurA30Jours = (parTranche.get('MOINS_7')?.valeur ?? 0) + (parTranche.get('DE_8_A_30')?.valeur ?? 0);
  const valeurPerimee = parTranche.get('PERIME')?.valeur ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Ce qui va être perdu"
        description="Lots classés par date de péremption — le plus urgent d’abord"
      />

      {resume.isLoading ? (
        <div
          className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule lg:grid-cols-4"
          role="status"
        >
          <span className="sr-only">Chargement des péremptions…</span>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2 bg-surface px-5 py-4">
              <Squelette className="h-3 w-24" />
              <Squelette className="h-6 w-32" />
            </div>
          ))}
        </div>
      ) : resume.isError || !resume.data ? (
        <ErrorState message={messageErreur(resume.error)} onRetry={() => resume.refetch()} />
      ) : (
        <section aria-label="Valeur menacée par tranche" className="flex flex-col gap-3">
          <p className="text-panneau text-ink-900">
            {valeurA30Jours > 0 ? (
              <>
                <span className="text-faible">{gnf(valeurA30Jours)}</span> périment dans 30 jours
              </>
            ) : (
              'Rien ne périme dans les 30 prochains jours'
            )}
            {valeurPerimee > 0 && (
              <span className="text-steel-500">
                {' '}
                — et <span className="text-rupture">{gnf(valeurPerimee)}</span> sont déjà périmés
              </span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule shadow-card lg:grid-cols-4">
            {resume.data.tranches.map((t) => {
              const actif = filtre === t.tranche;
              return (
                <button
                  key={t.tranche}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => setFiltre(actif ? null : t.tranche)}
                  className={cn(
                    'flex flex-col items-start gap-1 border-l-[3px] bg-surface px-4 py-4 text-left transition-colors hover:bg-paper sm:px-5',
                    TRANCHES[t.tranche].filet,
                    actif && 'bg-action-wash hover:bg-action-wash',
                  )}
                >
                  <span className="text-meta font-medium text-steel-500">{TRANCHES[t.tranche].libelle}</span>
                  <span className="text-chiffre text-ink-900">
                    {formatNombre(t.valeur)} <span className="text-corps font-medium text-steel-400">GNF</span>
                  </span>
                  <span className="text-meta text-steel-500">
                    {t.lots} {pluriel('lot', t.lots)} · {formatNombre(t.unites)} {pluriel('unité', t.unites)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {succes && <Alert variant="success">{succes}</Alert>}

      <Card>
        {lots.isLoading ? (
          <LoadingState />
        ) : lots.isError ? (
          <ErrorState message={messageErreur(lots.error)} onRetry={() => lots.refetch()} />
        ) : liste.length === 0 ? (
          <EmptyState
            titre={filtre ? 'Aucun lot dans cette tranche' : 'Aucun lot daté en stock'}
            description="Activez le suivi par lot sur la fiche d’un produit périssable : ses lots apparaîtront ici, du plus urgent au plus lointain."
          />
        ) : (
          <>
            <PanneauEntete
              titre={filtre ? TRANCHES[filtre].libelle : 'Tous les lots datés'}
              meta={filtre ? 'Touchez la tuile de nouveau pour tout afficher' : 'Le plus urgent d’abord'}
            />
            <ul className="divide-y divide-rule">
              {liste.map((lot) => (
                <li key={lot.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Vignette nom={lot.produit.nom} photoUrl={lot.produit.photoUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-corps font-medium text-ink-900">{lot.produit.nom}</p>
                      <p className="truncate text-meta text-steel-500">
                        <span className="font-mono text-ink-900">{lot.numero}</span> · {lot.emplacement.nom}
                        {lot.fournisseur && ` · ${lot.fournisseur.nom}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pl-12 sm:pl-0">
                    <div className="min-w-[96px] text-right">
                      <p className="text-corps font-semibold text-ink-900">{gnf(lot.valeur)}</p>
                      <p className="text-meta text-steel-500">
                        {formatNombre(lot.quantite)}{' '}
                        {lot.produit.uniteMesure?.toLocaleLowerCase('fr') ?? pluriel('unité', lot.quantite)}
                      </p>
                    </div>
                    <div className="min-w-[112px] text-right">
                      <p className={cn('text-corps font-semibold', TRANCHES[lot.tranche].texte)}>
                        {libelleJours(lot.joursRestants)}
                      </p>
                      <p className="text-meta text-steel-500">{datePeremption(lot.datePeremption)}</p>
                    </div>
                    <div className="ml-auto flex w-[150px] justify-end">
                      {lot.tranche === 'PERIME' ? (
                        <Button
                          variant="danger"
                          taille="sm"
                          onClick={() => {
                            setErreur(null);
                            setASortir(lot);
                          }}
                        >
                          <CalendarX2 className="size-4" aria-hidden="true" />
                          Sortir du stock
                        </Button>
                      ) : lot.tranche === 'MOINS_7' ? (
                        <Link
                          to={lienBrader(lot)}
                          className={boutonClasses('secondary', 'text-faible', {
                            taille: 'sm',
                          })}
                        >
                          <Tag className="size-4" aria-hidden="true" />
                          Brader
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {lots.hasNextPage && (
              <div className="flex justify-center border-t border-rule p-3">
                <Button variant="secondary" loading={lots.isFetchingNextPage} onClick={() => lots.fetchNextPage()}>
                  Afficher plus de lots
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <Modal
        ouvert={aSortir !== null}
        onFermer={() => setASortir(null)}
        titre={aSortir ? `Sortir le lot ${aSortir.numero} du stock ?` : ''}
        description="Le lot entier quitte le stock et l’historique l’enregistre comme une perte (périmé), distincte d’une vente."
        pied={
          <>
            <Button variant="secondary" onClick={() => setASortir(null)}>
              Garder le lot
            </Button>
            <Button variant="danger" loading={sortir.isPending} onClick={() => aSortir && sortir.mutate(aSortir)}>
              Sortir {aSortir ? `${formatNombre(aSortir.quantite)} ${pluriel('unité', aSortir.quantite)}` : ''}
            </Button>
          </>
        }
      >
        {aSortir && (
          <div className="flex flex-col gap-3">
            <p className="text-corps text-ink-900">
              {aSortir.produit.nom} · {aSortir.emplacement.nom} — périmé le {datePeremption(aSortir.datePeremption)}.
            </p>
            <p className="text-corps text-steel-500">Valeur perdue au prix d’achat : {gnf(aSortir.valeur)}.</p>
            {erreur && <Alert variant="error">{erreur}</Alert>}
          </div>
        )}
      </Modal>
    </div>
  );
}
