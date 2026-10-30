import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router-dom';
import { Ban, Download, Printer, Undo2 } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { dateCourte, dateHeure, gnf } from '@/lib/montant';
import { formatNombre, pluriel } from '@/lib/format';
import { texteRecuWhatsApp } from '@/lib/whatsapp';
import { BoutonWhatsApp } from '@/components/patterns/BoutonWhatsApp';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { ErrorState, LoadingState } from '@/components/patterns/States';
import { FormulaireRetourClient } from './FormulaireRetourClient';
import { PastillesPaiement } from './PastillesPaiement';
import { Facture } from './Facture';
import { imprimerFacture } from './imprimerFacture';
import { telechargerExport } from '@/lib/exporterCsv';
import { MODES } from './modes';
import type { EtatRetourClient, ModeReglement, VenteDetail } from './types';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { BoutonNouvelleVente } from '@/components/patterns/BoutonNouvelleVente';

const ETATS_RETOUR: Record<EtatRetourClient, string> = {
  REMISE_EN_STOCK: 'remise en stock',
  CASSE: 'déclarée en casse',
  RETOUR_FOURNISSEUR: 'renvoi au fournisseur',
};

const MODES_REGLEMENT: ModeReglement[] = ['ESPECES', 'ORANGE_MONEY', 'MTN_MOMO'];

export function VenteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const etat = location.state as { nouvelle?: boolean; alertePlafond?: VenteDetail['alertePlafond'] } | null;
  const queryClient = useQueryClient();

  const [montant, setMontant] = useState('');
  const [mode, setMode] = useState<ModeReglement>('ESPECES');
  const [erreur, setErreur] = useState<string | null>(null);
  const [annulationOuverte, setAnnulationOuverte] = useState(false);
  const [motif, setMotif] = useState('');
  const [retourOuvert, setRetourOuvert] = useState(false);
  const [succesRetour, setSuccesRetour] = useState<string | null>(null);
  const [erreurRegularisation, setErreurRegularisation] = useState<string | null>(null);
  const [telechargement, setTelechargement] = useState(false);
  const [erreurFacture, setErreurFacture] = useState<string | null>(null);
  const facture = useRef<HTMLElement>(null);

  const { data: vente, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['ventes', id],
    queryFn: async () => (await api.get<VenteDetail>(`/ventes/${id}`)).data,
  });

  async function telechargerFacture() {
    if (!vente) return;
    setTelechargement(true);
    setErreurFacture(null);
    try {
      await telechargerExport(`/ventes/${vente.id}/facture`, `facture-${vente.numero}.pdf`);
    } catch (e) {
      setErreurFacture(messageErreur(e));
    } finally {
      setTelechargement(false);
    }
  }

  function rafraichir(nouvelle: VenteDetail) {
    queryClient.setQueryData(['ventes', id], nouvelle);
    for (const cle of ['ventes', 'creances', 'clients', 'stock', 'mouvements', 'alertes', 'dashboard']) {
      queryClient.invalidateQueries({ queryKey: [cle], refetchType: cle === 'ventes' ? 'none' : 'active' });
    }
  }

  const encaisser = useMutation({
    mutationFn: async () =>
      (await api.post<VenteDetail>(`/ventes/${id}/reglements`, { montant: Number.parseInt(montant, 10), mode })).data,
    onSuccess: (v) => {
      rafraichir(v);
      setMontant('');
    },
    onError: (e) => setErreur(messageErreur(e, 'Le règlement n’a pas pu être enregistré.')),
  });

  const regulariser = useMutation({
    mutationFn: async () => (await api.post<VenteDetail>(`/ventes/${id}/regulariser`)).data,
    onSuccess: (v) => {
      rafraichir(v);
      setErreurRegularisation(null);
    },
    onError: (e) => setErreurRegularisation(messageErreur(e, 'La régularisation a échoué.')),
  });

  const annuler = useMutation({
    mutationFn: async () => (await api.post<VenteDetail>(`/ventes/${id}/annuler`, { motif })).data,
    onSuccess: (v) => {
      rafraichir(v);
      setAnnulationOuverte(false);
    },
    onError: (e) => setErreur(messageErreur(e, 'L’annulation a échoué.')),
  });

  if (isLoading) return <LoadingState variante="page" />;
  if (isError || !vente) return <ErrorState message={messageErreur(error, 'Vente introuvable.')} onRetry={() => refetch()} />;

  const annulee = vente.statut === 'ANNULEE';
  const retournable = vente.lignes.some(
    (l) => l.quantite > vente.retours.flatMap((r) => r.lignes).filter((x) => x.ligneVenteId === l.id).reduce((a, x) => a + x.quantite, 0),
  );
  const montantSaisi = Number.parseInt(montant, 10) || 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre={`Vente ${vente.numero}`}
        description={`${dateHeure(vente.createdAt)} · ${vente.emplacement.nom} · par ${vente.utilisateur.nom}`}
        action={
          <>
            {vente.aRegulariser && !annulee && <Badge variant="faible">À régulariser</Badge>}
            {annulee ? <Badge variant="rupture">Annulée</Badge> : vente.resteDu > 0 ? <Badge variant="faible">À crédit</Badge> : <Badge variant="ok">Réglée</Badge>}
            <BoutonNouvelleVente />
          </>
        }
      />

      {etat?.nouvelle && !annulee && <Alert variant="success">Vente enregistrée : le stock a été mis à jour.</Alert>}
      {etat?.nouvelle && etat.alertePlafond && (
        <Alert variant="warning">
          Plafond de crédit dépassé de {gnf(etat.alertePlafond.depassement)} : la dette du client atteint{' '}
          {gnf(etat.alertePlafond.solde)} pour un plafond de {gnf(etat.alertePlafond.plafondCredit)}.
        </Alert>
      )}
      {succesRetour && <Alert variant="success">{succesRetour}</Alert>}
      {vente.saisieHorsLigneAt && !vente.aRegulariser && !annulee && (
        <Alert variant="info">Vente saisie hors ligne le {dateHeure(vente.saisieHorsLigneAt)}, envoyée à la synchronisation.</Alert>
      )}
      {vente.aRegulariser && !annulee && (
        <Alert variant="warning">
          <div className="flex flex-col gap-2.5">
            <p>
              <strong>À régulariser.</strong> Vendue hors ligne le {dateHeure(vente.saisieHorsLigneAt ?? vente.createdAt)}{' '}
              alors que le stock enregistré ne suffisait pas : la quantité manquante n’est pas encore sortie du stock.
            </p>
            <ul className="list-disc pl-5">
              {vente.lignes
                .filter((l) => l.quantiteARegulariser > 0)
                .map((l) => (
                  <li key={l.id}>
                    {l.libelle} : {l.quantiteARegulariser} sur {l.quantite}
                  </li>
                ))}
            </ul>
            <p>Enregistrez l’entrée de marchandise manquante (ou corrigez le stock par un inventaire), puis régularisez.</p>
            {erreurRegularisation && <p className="font-medium text-rupture">{erreurRegularisation}</p>}
            <div>
              <Button variant="secondary" loading={regulariser.isPending} onClick={() => regulariser.mutate()}>
                Régulariser maintenant
              </Button>
            </div>
          </div>
        </Alert>
      )}
      {annulee && (
        <Alert variant="warning">
          Annulée le {dateHeure(vente.annuleeAt!)} — {vente.motifAnnulation}. Le stock a été restitué.
          {vente.montantARembourser > 0 && ` ${gnf(vente.montantARembourser)} sont à rembourser au client.`}
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <PanneauEntete
            titre="Facture"
            meta={vente.client ? `Client : ${vente.client.nom}` : 'Client de passage'}
          />
          <div className="flex flex-wrap gap-2 border-b border-rule px-5 py-3">
            <button
              type="button"
              onClick={telechargerFacture}
              disabled={telechargement}
              className={boutonClasses('secondary', 'flex-1 sm:flex-none', { taille: 'sm' })}
            >
              <Download className="size-4" aria-hidden="true" />
              {telechargement ? 'Préparation…' : 'Télécharger PDF'}
            </button>
            <button
              type="button"
              onClick={() => facture.current && imprimerFacture(facture.current)}
              className={boutonClasses('secondary', 'flex-1 sm:flex-none', { taille: 'sm' })}
            >
              <Printer className="size-4" aria-hidden="true" />
              Imprimer
            </button>
            {!annulee && (
              <BoutonWhatsApp
                telephone={vente.client?.telephone ?? null}
                texte={texteRecuWhatsApp(vente)}
                libelle="Envoyer par WhatsApp"
                compact
                className="w-full sm:w-auto"
              />
            )}
          </div>
          {erreurFacture && (
            <div className="px-5 pt-3">
              <Alert variant="error">{erreurFacture}</Alert>
            </div>
          )}
          <div className="bg-paper p-3 sm:p-6">
            <Facture vente={vente} ref={facture} />
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <PanneauEntete
              titre="Règlements"
              meta={
                annulee
                  ? `Vente annulée : ${gnf(vente.montantARembourser)} à rembourser`
                  : `Payé ${gnf(vente.paye)} sur ${gnf(vente.total)}`
              }
            />
            <ul className="divide-y divide-rule">
              {vente.reglements.length === 0 && <li className="px-5 py-4 text-corps text-steel-500">Aucun règlement pour l’instant.</li>}
              {vente.reglements.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn('size-2 shrink-0 rounded-full', MODES[r.mode].point)} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-corps text-ink-900">{MODES[r.mode].libelle}</p>
                    <p className="text-meta text-steel-500">
                      {dateHeure(r.createdAt)} · {r.utilisateur.nom}
                    </p>
                  </div>
                  <span className="text-corps font-semibold text-ink-900">{gnf(r.montant)}</span>
                </li>
              ))}
            </ul>
            {!annulee && vente.resteDu > 0 && (
              <div className="flex flex-col gap-4 border-t border-rule bg-entete-groupe p-4 sm:p-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-corps font-medium text-faible">Reste dû</span>
                  <span className="text-panneau text-faible">{gnf(vente.resteDu)}</span>
                </div>
                {vente.echeanceAt && <p className="-mt-3 text-meta text-steel-500">Échéance : {dateCourte(vente.echeanceAt)}</p>}
                <label className="flex flex-col gap-1.5">
                  <span className="text-corps font-medium text-ink-900">Montant encaissé</span>
                  <span className="flex gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={vente.resteDu}
                      value={montant}
                      onChange={(e) => setMontant(e.target.value)}
                      placeholder={String(vente.resteDu)}
                      className="h-10 min-w-0 flex-1 champ rounded-md border border-rule-strong bg-surface-elevee px-3 text-corps text-ink-900"
                    />
                    <Button variant="secondary" onClick={() => setMontant(String(vente.resteDu))}>
                      Tout
                    </Button>
                  </span>
                </label>
                <PastillesPaiement libelle="Payé en" nom="mode-reglement" modes={MODES_REGLEMENT} valeur={mode} onChange={setMode} />
                {erreur && <Alert variant="error">{erreur}</Alert>}
                <Button
                  onClick={() => {
                    setErreur(null);
                    encaisser.mutate();
                  }}
                  disabled={montantSaisi <= 0 || montantSaisi > vente.resteDu}
                  loading={encaisser.isPending}
                >
                  Encaisser {montantSaisi > 0 ? gnf(montantSaisi) : ''}
                </Button>
              </div>
            )}
          </Card>

          {vente.retours.length > 0 && (
            <Card>
              <PanneauEntete titre="Retours" meta={`${gnf(vente.retours.reduce((a, r) => a + r.montant, 0))} retournés`} />
              <ul className="divide-y divide-rule">
                {vente.retours.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                    <Undo2 className="size-4 shrink-0 text-steel-500" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-corps text-ink-900">
                        {formatNombre(r.lignes.reduce((a, l) => a + l.quantite, 0))} {pluriel('unité', r.lignes.reduce((a, l) => a + l.quantite, 0))} · {ETATS_RETOUR[r.etat]}
                      </p>
                      <p className="text-meta text-steel-500">
                        {r.compensation === 'DEDUIRE_DETTE' ? 'Déduit de la dette' : 'Remboursé en espèces'} · {dateHeure(r.createdAt)} ·{' '}
                        {r.utilisateur.nom}
                      </p>
                    </div>
                    <span className="text-corps font-semibold text-ink-900">{gnf(r.montant)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {!annulee && (
            <div className="flex flex-wrap gap-2">
              {retournable && !vente.aRegulariser && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSuccesRetour(null);
                    setRetourOuvert(true);
                  }}
                >
                  <Undo2 className="size-4" aria-hidden="true" />
                  Retour client
                </Button>
              )}
              {vente.retours.length === 0 && (
                <Button variant="ghost" className="text-rupture hover:bg-rupture-wash" onClick={() => setAnnulationOuverte(true)}>
                  <Ban className="size-4" aria-hidden="true" />
                  Annuler cette vente
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {retourOuvert && (
        <FormulaireRetourClient
          vente={vente}
          onFermer={() => setRetourOuvert(false)}
          onRetourne={(r) => {
            setRetourOuvert(false);
            setSuccesRetour(
              r.compensation === 'DEDUIRE_DETTE'
                ? `Retour enregistré : ${gnf(r.montant)} déduits de la dette${r.soldeClient !== null ? `, qui passe à ${gnf(r.soldeClient)}` : ''}.`
                : `Retour enregistré : ${gnf(r.montant)} à rembourser au client en espèces.`,
            );
            refetch();
          }}
        />
      )}

      <Modal
        ouvert={annulationOuverte}
        onFermer={() => setAnnulationOuverte(false)}
        titre={`Annuler la vente ${vente.numero} ?`}
        description="La vente reste visible, marquée annulée ; le stock de chaque ligne est restitué au dépôt."
        pied={
          <>
            <Button variant="secondary" onClick={() => setAnnulationOuverte(false)}>
              Garder la vente
            </Button>
            <Button variant="danger" disabled={motif.trim().length < 3} loading={annuler.isPending} onClick={() => annuler.mutate()}>
              Annuler la vente
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {vente.paye > 0 && (
            <Alert variant="warning">{gnf(vente.paye)} déjà encaissés seront à rembourser au client.</Alert>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-corps font-medium text-ink-900">Motif (obligatoire)</span>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={3}
              placeholder="Ex. erreur de quantité, client revenu sur sa commande…"
              className="champ rounded-md border border-rule-strong bg-surface-elevee px-3 py-2 text-corps text-ink-900"
            />
          </label>
          {erreur && annulationOuverte && <Alert variant="error">{erreur}</Alert>}
        </div>
      </Modal>
    </div>
  );
}
