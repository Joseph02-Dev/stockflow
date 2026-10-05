import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre, pluriel } from '@/lib/format';
import { dateHeure, gnf } from '@/lib/montant';
import { cn } from '@/lib/cn';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import type { VarianteBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Onglets } from '@/components/patterns/Onglets';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { FormulaireRetourFournisseur } from './FormulaireRetourFournisseur';
import type { ListeRetoursFournisseur, RetourFournisseur, StatutAvoir } from './types';

const STATUTS: Record<StatutAvoir, { libelle: string; variante: VarianteBadge }> = {
  ATTENDU: { libelle: 'Avoir attendu', variante: 'faible' },
  RECU: { libelle: 'Avoir reçu', variante: 'ok' },
  REFUSE: { libelle: 'Refusé', variante: 'rupture' },
};

type Filtre = 'TOUS' | StatutAvoir;
const FILTRES: readonly { cle: Filtre; libelle: string }[] = [
  { cle: 'TOUS', libelle: 'Tous' },
  { cle: 'ATTENDU', libelle: 'Avoir attendu' },
  { cle: 'RECU', libelle: 'Avoir reçu' },
  { cle: 'REFUSE', libelle: 'Refusé' },
];

/**
 * Marchandise renvoyée aux fournisseurs et suivi des avoirs. Un avoir
 * refusé ne touche plus au stock (sorti au renvoi) : sa valeur rejoint
 * les pertes du mois.
 */
export function RetoursFournisseurPage() {
  const queryClient = useQueryClient();
  const [filtre, setFiltre] = useState<Filtre>('TOUS');
  const [creation, setCreation] = useState(false);
  const [succes, setSucces] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const liste = useQuery({
    queryKey: ['retours-fournisseur', filtre],
    queryFn: async () =>
      (await api.get<ListeRetoursFournisseur>(`/retours-fournisseur${filtre === 'TOUS' ? '' : `?statut=${filtre}`}`)).data,
  });

  const avoir = useMutation({
    mutationFn: async ({ retour, statut }: { retour: RetourFournisseur; statut: 'RECU' | 'REFUSE' }) =>
      (await api.patch<RetourFournisseur>(`/retours-fournisseur/${retour.id}/avoir`, { statut })).data,
    onSuccess: (retour) => {
      queryClient.invalidateQueries({ queryKey: ['retours-fournisseur'] });
      queryClient.invalidateQueries({ queryKey: ['pertes'] });
      setErreur(null);
      setSucces(
        retour.statutAvoir === 'RECU'
          ? `Avoir de ${retour.fournisseur.nom} reçu : ${gnf(retour.valeurTotale)}.`
          : `Avoir refusé : ${gnf(retour.valeurTotale)} passent en pertes, sans nouvelle sortie de stock.`,
      );
    },
    onError: (e) => setErreur(messageErreur(e, 'La mise à jour de l’avoir a échoué.')),
  });

  const retours = liste.data?.retours ?? [];
  const attente = liste.data?.avoirsEnAttente;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Retours fournisseur"
        description="La marchandise renvoyée sort du stock au départ ; suivez ici les avoirs à recevoir."
        action={
          <Button onClick={() => setCreation(true)}>
            <Undo2 className="size-4" aria-hidden="true" />
            Nouveau retour
          </Button>
        }
      />

      {succes && <Alert variant="success">{succes}</Alert>}
      {erreur && <Alert variant="error">{erreur}</Alert>}

      <Onglets onglets={FILTRES} actif={filtre} onChange={setFiltre} libelle="Statut de l’avoir" />

      <Card>
        <PanneauEntete
          titre="Retours"
          meta={liste.data ? `${formatNombre(retours.length)} ${pluriel('retour', retours.length)}` : undefined}
        />
        {liste.isLoading ? (
          <LoadingState />
        ) : liste.isError ? (
          <ErrorState message={messageErreur(liste.error)} onRetry={() => liste.refetch()} />
        ) : retours.length === 0 ? (
          <EmptyState
            titre={filtre === 'TOUS' ? 'Aucun retour fournisseur' : 'Aucun retour dans ce statut'}
            description="Un lot défectueux, une mauvaise référence livrée : renvoyez-le ici pour suivre l’avoir."
          />
        ) : (
          <ul className="divide-y divide-rule">
            {retours.map((r) => {
              const statut = STATUTS[r.statutAvoir];
              const enCours = avoir.isPending && avoir.variables?.retour.id === r.id;
              return (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Vignette
                      nom={r.mouvements[0]?.produit.nom ?? r.fournisseur.nom}
                      photoUrl={r.mouvements[0]?.produit.photoUrl ?? null}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-corps font-medium text-ink-900 sm:truncate">
                        {r.fournisseur.nom}
                        <span className="font-normal text-steel-500">
                          {' · '}
                          {r.mouvements.map((m) => `${formatNombre(m.quantite)} × ${m.produit.nom}`).join(', ')}
                        </span>
                      </p>
                      <p className="truncate text-meta text-steel-500">
                        « {r.motif} » · {r.emplacement.nom} · {r.utilisateur.nom} · {dateHeure(r.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pl-12 sm:flex-nowrap sm:pl-0">
                    <span className={cn('text-corps font-semibold', r.statutAvoir === 'REFUSE' ? 'text-rupture' : 'text-ink-900')}>
                      {gnf(r.valeurTotale)}
                    </span>
                    <Badge variant={statut.variante}>{statut.libelle}</Badge>
                    {r.statutAvoir === 'ATTENDU' && (
                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          taille="sm"
                          loading={enCours && avoir.variables?.statut === 'RECU'}
                          disabled={enCours}
                          onClick={() => avoir.mutate({ retour: r, statut: 'RECU' })}
                        >
                          Avoir reçu
                        </Button>
                        <Button
                          variant="ghost"
                          taille="sm"
                          loading={enCours && avoir.variables?.statut === 'REFUSE'}
                          disabled={enCours}
                          onClick={() => avoir.mutate({ retour: r, statut: 'REFUSE' })}
                        >
                          Refusé
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {attente && (
          <div className="flex items-baseline justify-between gap-3 border-t border-rule bg-paper px-4 py-3 sm:px-5">
            <span className="text-corps text-steel-700">
              {attente.nombre === 0
                ? 'Aucun avoir en attente'
                : `${formatNombre(attente.nombre)} ${pluriel('avoir', attente.nombre)} en attente`}
            </span>
            <span className="text-corps font-semibold text-faible">{gnf(attente.valeur)}</span>
          </div>
        )}
      </Card>

      {creation && (
        <FormulaireRetourFournisseur
          onFermer={() => setCreation(false)}
          onCree={(r) => {
            setCreation(false);
            setErreur(null);
            setSucces(`Retour enregistré : ${gnf(r.valeurTotale)} sortis du stock, avoir attendu de ${r.fournisseur.nom}.`);
          }}
        />
      )}
    </div>
  );
}
