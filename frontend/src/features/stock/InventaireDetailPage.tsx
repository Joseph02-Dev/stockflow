import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Card, PageHeader } from '@/components/patterns/Page';
import { cn } from '@/lib/cn';
import { ErrorState, LoadingState } from '@/components/patterns/States';
import { datePeremption } from '@/features/peremptions/presentation';

interface Ligne {
  id: string;
  produitId: string;
  quantiteComptee: number | null;
  quantiteSysteme: number;
  ecart: number | null;
  statutAjustement: 'EN_ATTENTE' | 'VALIDEE' | 'IGNOREE';
  produit: { nom: string; reference: string | null; uniteMesure: string | null };
  /** Produit suivi par lot : une ligne par lot. */
  lotId: string | null;
  lot: { numero: string; datePeremption: string | null } | null;
}

interface InventaireDetail {
  id: string;
  statut: 'EN_COURS' | 'TERMINE';
  emplacement: { nom: string };
  lignes: Ligne[];
}

/** Champ de saisie du comptage — sauvegarde à la perte de focus (onBlur). */
function ChampComptage({
  ligne,
  onSauvegarder,
}: {
  ligne: Ligne;
  onSauvegarder: (quantite: number) => void;
}) {
  const [valeur, setValeur] = useState(ligne.quantiteComptee?.toString() ?? '');

  function sauvegarderSiValide() {
    const nombre = Number(valeur);
    if (valeur !== '' && !Number.isNaN(nombre) && nombre >= 0 && nombre !== ligne.quantiteComptee) {
      onSauvegarder(nombre);
    }
  }

  return (
    <input
      type="number"
      min={0}
      value={valeur}
      onChange={(e) => setValeur(e.target.value)}
      onBlur={sauvegarderSiValide}
      className="h-9 w-24 rounded-md border border-rule-strong bg-surface px-2.5 text-right text-corps text-ink-900 placeholder:text-steel-400 hover:border-steel-400 focus:border-action"
      placeholder="—"
      aria-label={`Quantité comptée pour ${ligne.produit.nom}${ligne.lot ? `, lot ${ligne.lot.numero}` : ''}`}
    />
  );
}

export function InventaireDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmationTerminer, setConfirmationTerminer] = useState(false);

  const inventaire = useQuery({
    queryKey: ['inventaire', id],
    queryFn: async () => (await api.get<InventaireDetail>(`/inventaires/${id}`)).data,
  });

  const saisir = useMutation({
    mutationFn: async ({ ligneId, quantiteComptee }: { ligneId: string; quantiteComptee: number }) =>
      api.patch(`/inventaires/${id}/lignes/${ligneId}`, { quantiteComptee }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventaire', id] }),
    onError: (err) => setErreur(messageErreur(err, 'La sauvegarde du comptage a échoué.')),
  });

  const terminer = useMutation({
    mutationFn: async () => api.post(`/inventaires/${id}/terminer`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventaire', id] });
      queryClient.invalidateQueries({ queryKey: ['inventaires'] });
      setConfirmationTerminer(false);
    },
    onError: (err) => setErreur(messageErreur(err, 'La finalisation a échoué.')),
  });

  const valider = useMutation({
    mutationFn: async (ligneId: string) => api.post(`/inventaires/${id}/lignes/${ligneId}/valider`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventaire', id] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['mouvements'] });
      queryClient.invalidateQueries({ queryKey: ['alertes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => setErreur(messageErreur(err, 'La validation a échoué.')),
  });

  const ignorer = useMutation({
    mutationFn: async (ligneId: string) => api.post(`/inventaires/${id}/lignes/${ligneId}/ignorer`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventaire', id] }),
    onError: (err) => setErreur(messageErreur(err, 'L’action a échoué.')),
  });

  if (inventaire.isLoading) return <LoadingState variante="page" />;
  if (inventaire.isError || !inventaire.data) {
    return (
      <ErrorState
        message={messageErreur(inventaire.error, 'Inventaire introuvable.')}
        onRetry={() => inventaire.refetch()}
      />
    );
  }

  const data = inventaire.data;
  const enCours = data.statut === 'EN_COURS';
  const nombreComptees = data.lignes.filter((l) => l.quantiteComptee !== null).length;
  const nombreEcartsEnAttente = data.lignes.filter(
    (l) => l.statutAjustement === 'EN_ATTENTE' && l.ecart !== null && l.ecart !== 0,
  ).length;

  const progression = Math.round((nombreComptees / Math.max(data.lignes.length, 1)) * 100);
  // Une seule grille pour tous les écrans : le champ de comptage n'existe
  // qu'une fois dans le DOM (pas de double saisie desktop / mobile).
  const colonnes = enCours
    ? 'md:grid-cols-[minmax(0,1fr)_110px_130px]'
    : 'md:grid-cols-[minmax(0,1fr)_100px_100px_110px_200px]';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre={`Inventaire ${data.emplacement.nom}`}
        description={
          enCours
            ? `${nombreComptees} sur ${data.lignes.length} ${data.lignes.length > 1 ? 'produits comptés' : 'produit compté'}, saisie enregistrée à chaque champ quitté`
            : nombreEcartsEnAttente > 0
              ? `${nombreEcartsEnAttente} ${nombreEcartsEnAttente > 1 ? 'écarts attendent' : 'écart attend'} votre décision`
              : 'Tous les écarts ont été traités'
        }
        action={
          <>
            <Badge variant={enCours ? 'faible' : 'ok'}>{enCours ? 'En cours' : 'Terminé'}</Badge>
            {enCours && (
              <Button onClick={() => setConfirmationTerminer(true)}>
                <Check className="size-4" aria-hidden="true" />
                Terminer l’inventaire
              </Button>
            )}
          </>
        }
      />

      {enCours && (
        <div className="flex items-center gap-3" aria-hidden="true">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-rule">
            <div className="h-full rounded-full bg-action transition-[width]" style={{ width: `${progression}%` }} />
          </div>
          <span className="text-meta font-medium text-steel-500">{progression} %</span>
        </div>
      )}

      {erreur && <Alert variant="error">{erreur}</Alert>}

      <Card>
        <div
          className={cn(
            'hidden gap-4 border-b border-rule bg-entete-tableau px-5 py-2.5 text-meta font-medium text-steel-500 md:grid',
            colonnes,
          )}
          aria-hidden="true"
        >
          <span>Produit</span>
          <span className="text-right">Système</span>
          <span className="text-right">Comptée</span>
          {!enCours && <span className="text-right">Écart</span>}
          {!enCours && <span className="text-right">Décision</span>}
        </div>
        <ul className="divide-y divide-rule">
          {data.lignes.map((ligne) => {
            const unite = ligne.produit.uniteMesure;
            return (
              <li
                key={ligne.id}
                className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5', colonnes)}
              >
                <div className="min-w-0">
                  <p className="line-clamp-2 text-corps font-medium text-ink-900 md:truncate">{ligne.produit.nom}</p>
                  {ligne.lot && (
                    <p className="text-meta text-steel-500">
                      Lot <span className="font-mono text-ink-900">{ligne.lot.numero}</span>
                      {ligne.lot.datePeremption && ` · périme le ${datePeremption(ligne.lot.datePeremption)}`}
                    </p>
                  )}
                  {ligne.produit.reference && (
                    <p className="font-mono text-meta text-steel-500">{ligne.produit.reference}</p>
                  )}
                </div>
                <p className="text-right text-corps whitespace-nowrap text-steel-700">
                  <span className="block text-meta text-steel-400 md:hidden">Système</span>
                  {ligne.quantiteSysteme}
                  {unite && <span className="text-meta text-steel-400"> {unite}</span>}
                </p>
                <div className="col-span-2 flex items-center justify-between gap-3 md:col-span-1 md:justify-end">
                  <span className="text-meta text-steel-500 md:hidden">Quantité comptée</span>
                  {enCours ? (
                    <ChampComptage
                      ligne={ligne}
                      onSauvegarder={(quantiteComptee) => saisir.mutate({ ligneId: ligne.id, quantiteComptee })}
                    />
                  ) : ligne.quantiteComptee !== null ? (
                    <span className="text-corps font-semibold text-ink-900">{ligne.quantiteComptee}</span>
                  ) : (
                    <span className="text-corps text-steel-400">Non compté</span>
                  )}
                </div>
                {!enCours && (
                  <div className="flex items-center gap-2 md:justify-end">
                    <span className="text-meta text-steel-500 md:hidden">Écart</span>
                    {ligne.ecart === null ? (
                      <span className="text-steel-400">—</span>
                    ) : ligne.ecart === 0 ? (
                      <Badge variant="ok">Aucun écart</Badge>
                    ) : (
                      <Badge variant={ligne.ecart > 0 ? 'action' : 'rupture'}>
                        {ligne.ecart > 0 ? `+${ligne.ecart}` : `−${Math.abs(ligne.ecart)}`}
                        {ligne.ecart > 0 ? ' en trop' : ' manquant'}
                      </Badge>
                    )}
                  </div>
                )}
                {!enCours && (
                  <div className="flex justify-end gap-1">
                    {ligne.statutAjustement === 'VALIDEE' && <Badge variant="ok">Stock corrigé</Badge>}
                    {ligne.statutAjustement === 'IGNOREE' && <Badge variant="neutral">Ignoré</Badge>}
                    {ligne.statutAjustement === 'EN_ATTENTE' && ligne.ecart !== null && ligne.ecart !== 0 && (
                      <>
                        <Button
                          variant="ghost"
                          taille="sm"
                          onClick={() => ignorer.mutate(ligne.id)}
                          disabled={ignorer.isPending || valider.isPending}
                        >
                          <X className="size-4" aria-hidden="true" />
                          Ignorer
                        </Button>
                        <Button
                          variant="secondary"
                          taille="sm"
                          onClick={() => valider.mutate(ligne.id)}
                          disabled={ignorer.isPending || valider.isPending}
                        >
                          <Check className="size-4" aria-hidden="true" />
                          Valider
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Modal
        ouvert={confirmationTerminer}
        onFermer={() => setConfirmationTerminer(false)}
        titre="Terminer l’inventaire ?"
        description="Les comptages ne seront plus modifiables. Vous pourrez ensuite valider ou ignorer chaque écart."
        pied={
          <>
            <Button variant="secondary" onClick={() => setConfirmationTerminer(false)}>
              Annuler
            </Button>
            <Button loading={terminer.isPending} onClick={() => terminer.mutate()}>
              Terminer
            </Button>
          </>
        }
      >
        {nombreComptees < data.lignes.length && (
          <p className="text-corps text-steel-500">
            {data.lignes.length - nombreComptees} produit(s) n’ont pas encore été comptés et resteront sans écart
            calculable.
          </p>
        )}
      </Modal>
    </div>
  );
}
