import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Check, X } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/patterns/Page';
import { ErrorState, LoadingState } from '@/components/patterns/States';

interface Ligne {
  id: string;
  produitId: string;
  quantiteComptee: number | null;
  quantiteSysteme: number;
  ecart: number | null;
  statutAjustement: 'EN_ATTENTE' | 'VALIDEE' | 'IGNOREE';
  produit: { nom: string; reference: string | null; uniteMesure: string | null };
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
      className="w-24 rounded-(--radius-button) border border-border-subtle bg-surface px-2 py-1.5 text-sm text-text-primary"
      placeholder="—"
      aria-label={`Quantité comptée pour ${ligne.produit.nom}`}
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

  if (inventaire.isLoading) return <LoadingState />;
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

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Fil d’Ariane" className="flex items-center gap-1 text-sm text-text-secondary">
        <Link to="/stock" className="hover:text-text-primary hover:underline">
          Stock & Mouvements
        </Link>
        <ChevronRight className="size-4" aria-hidden="true" />
        <span className="text-text-primary">Inventaire</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{data.emplacement.nom}</h1>
          <p className="text-sm text-text-secondary">
            {enCours
              ? `${nombreComptees} / ${data.lignes.length} produit(s) compté(s)`
              : `${nombreEcartsEnAttente} écart(s) en attente de traitement`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={enCours ? 'warning' : 'success'}>{enCours ? 'En cours' : 'Terminé'}</Badge>
          {enCours && <Button onClick={() => setConfirmationTerminer(true)}>Terminer l’inventaire</Button>}
        </div>
      </div>

      {erreur && <Alert variant="error">{erreur}</Alert>}

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b border-border-subtle bg-background text-left">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Produit</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Quantité système</th>
              <th scope="col" className="px-4 py-3 font-medium text-text-secondary">
                {enCours ? 'Quantité comptée' : 'Comptée'}
              </th>
              {!enCours && <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Écart</th>}
              {!enCours && (
                <th scope="col" className="px-4 py-3 text-right font-medium text-text-secondary">Action</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {data.lignes.map((ligne) => (
              <tr key={ligne.id}>
                <td className="px-4 py-3">
                  <span className="font-medium text-text-primary">{ligne.produit.nom}</span>
                  {ligne.produit.reference && (
                    <span className="ml-2 text-xs text-text-secondary">{ligne.produit.reference}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {ligne.quantiteSysteme}
                  {ligne.produit.uniteMesure ? ` ${ligne.produit.uniteMesure.toLowerCase()}` : ''}
                </td>
                <td className="px-4 py-3">
                  {enCours ? (
                    <ChampComptage
                      ligne={ligne}
                      onSauvegarder={(quantiteComptee) => saisir.mutate({ ligneId: ligne.id, quantiteComptee })}
                    />
                  ) : ligne.quantiteComptee !== null ? (
                    ligne.quantiteComptee
                  ) : (
                    <span className="text-text-secondary">Non compté</span>
                  )}
                </td>
                {!enCours && (
                  <td className="px-4 py-3">
                    {ligne.ecart === null ? (
                      <span className="text-text-secondary">—</span>
                    ) : ligne.ecart === 0 ? (
                      <Badge variant="success">Aucun écart</Badge>
                    ) : (
                      <Badge variant={ligne.ecart > 0 ? 'info' : 'error'}>
                        {ligne.ecart > 0 ? `+${ligne.ecart}` : ligne.ecart}
                      </Badge>
                    )}
                  </td>
                )}
                {!enCours && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {ligne.statutAjustement === 'VALIDEE' && <Badge variant="success">Validé</Badge>}
                      {ligne.statutAjustement === 'IGNOREE' && <Badge variant="neutral">Ignoré</Badge>}
                      {ligne.statutAjustement === 'EN_ATTENTE' && ligne.ecart !== null && ligne.ecart !== 0 && (
                        <>
                          <Button
                            variant="ghost"
                            onClick={() => ignorer.mutate(ligne.id)}
                            disabled={ignorer.isPending || valider.isPending}
                          >
                            <X className="size-4" aria-hidden="true" />
                            Ignorer
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => valider.mutate(ligne.id)}
                            disabled={ignorer.isPending || valider.isPending}
                          >
                            <Check className="size-4" aria-hidden="true" />
                            Valider
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
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
          <p className="text-sm text-text-secondary">
            {data.lignes.length - nombreComptees} produit(s) n’ont pas encore été comptés et resteront sans écart
            calculable.
          </p>
        )}
      </Modal>
    </div>
  );
}
