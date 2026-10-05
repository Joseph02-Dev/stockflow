import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Minus, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre } from '@/lib/format';
import { gnf } from '@/lib/montant';
import { cn } from '@/lib/cn';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SelecteurChamp } from '@/components/ui/SelecteurChamp';
import { BoutonMotif } from '@/features/pertes/FormulaireCasse';
import { MOTIFS, MOTIFS_PRINCIPAUX } from '@/features/pertes/motifs';
import { montantFacture } from './montantRetour';
import type { CompensationRetour, EtatRetourClient, RetourClientCree, SituationClient, VenteDetail } from './types';

const schema = z
  .object({
    quantites: z.array(z.number().int().min(0)),
    etat: z.enum(['REMISE_EN_STOCK', 'CASSE', 'RETOUR_FOURNISSEUR']),
    motifPerte: z.enum(['CASSE_MANUTENTION', 'DEGAT_EAUX', 'VOL', 'ERREUR_SAISIE', 'AUTRE']).optional(),
    fournisseurId: z.string().optional(),
    compensation: z.enum(['DEDUIRE_DETTE', 'REMBOURSEMENT']),
    commentaire: z.string().max(500, '500 caractères au maximum.').optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.quantites.some((q) => q > 0)) {
      ctx.addIssue({ code: 'custom', path: ['quantites'], message: 'Indiquez au moins une quantité retournée.' });
    }
    if (v.etat === 'CASSE' && !v.motifPerte) {
      ctx.addIssue({ code: 'custom', path: ['motifPerte'], message: 'Choisissez le motif de la casse.' });
    }
    if (v.etat === 'RETOUR_FOURNISSEUR' && !v.fournisseurId) {
      ctx.addIssue({ code: 'custom', path: ['fournisseurId'], message: 'Choisissez le fournisseur.' });
    }
  });
type Formulaire = z.infer<typeof schema>;

/** Option radio en carte : titre, et la conséquence concrète du choix. */
function OptionCarte({
  nom,
  valeur,
  actif,
  desactive,
  titre,
  consequence,
  onChoisir,
  children,
}: {
  nom: string;
  valeur: string;
  actif: boolean;
  desactive?: boolean;
  titre: string;
  consequence: ReactNode;
  onChoisir: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-[9px] border transition-colors',
        actif ? 'border-action bg-action-wash/40' : 'border-rule-strong',
        desactive && 'opacity-60',
      )}
    >
      <label className={cn('flex gap-3 p-3', desactive ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <input
          type="radio"
          name={nom}
          value={valeur}
          checked={actif}
          disabled={desactive}
          onChange={onChoisir}
          className="mt-1 size-4 shrink-0 accent-[var(--color-action)]"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-corps font-medium text-ink-900">{titre}</span>
          <span className="text-meta text-steel-500">{consequence}</span>
        </span>
      </label>
      {actif && children && <div className="flex flex-col gap-2 px-3 pb-3 pl-10">{children}</div>}
    </div>
  );
}

/**
 * Retour client sur une vente validée : lignes d'origine et quantités,
 * état de la marchandise (trois issues, chacune avec sa conséquence),
 * dédommagement, puis récapitulatif de la dette du client après retour.
 */
export function FormulaireRetourClient({
  vente,
  onFermer,
  onRetourne,
}: {
  vente: VenteDetail;
  onFermer: () => void;
  onRetourne: (retour: RetourClientCree) => void;
}) {
  const queryClient = useQueryClient();
  const [erreur, setErreur] = useState<string | null>(null);

  const dejaRetourne = (ligneId: string) =>
    vente.retours
      .flatMap((r) => r.lignes)
      .filter((l) => l.ligneVenteId === ligneId)
      .reduce((a, l) => a + l.quantite, 0);
  const retournables = vente.lignes.map((l) => l.quantite - dejaRetourne(l.id));

  const situation = useQuery({
    queryKey: ['clients', vente.client?.id, 'situation'],
    queryFn: async () => (await api.get<SituationClient>(`/clients/${vente.client!.id}/situation`)).data,
    enabled: !!vente.client,
  });
  const fournisseurs = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: async () => (await api.get<{ id: string; nom: string; archive?: boolean }[]>('/fournisseurs')).data,
  });
  const prixAchat = useQuery({
    queryKey: ['produits', '', false],
    queryFn: async () => (await api.get<{ id: string; prixAchat: number | null }[]>('/produits')).data,
  });

  const { handleSubmit, control, setValue, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
    defaultValues: {
      quantites: vente.lignes.map(() => 0),
      etat: 'REMISE_EN_STOCK',
      compensation: vente.client && vente.resteDu > 0 ? 'DEDUIRE_DETTE' : 'REMBOURSEMENT',
      fournisseurId: '',
      commentaire: '',
    },
  });
  const quantites = useWatch({ control, name: 'quantites' });
  const etat = useWatch({ control, name: 'etat' });
  const motifPerte = useWatch({ control, name: 'motifPerte' });
  const compensation = useWatch({ control, name: 'compensation' });

  const montants = vente.lignes.map(
    (l, i) => montantFacture(l, dejaRetourne(l.id) + (quantites[i] ?? 0), vente) - montantFacture(l, dejaRetourne(l.id), vente),
  );
  const montant = montants.reduce((a, b) => a + b, 0);
  const unites = quantites.reduce((a, b) => a + b, 0);
  const prixAchatDe = new Map((prixAchat.data ?? []).map((p) => [p.id, p.prixAchat ?? 0]));
  const valeurAchat = vente.lignes.reduce((a, l, i) => a + (quantites[i] ?? 0) * (prixAchatDe.get(l.produitId) ?? 0), 0);

  const deductionPossible = !!vente.client && montant <= vente.resteDu;
  const raisonDeduction = !vente.client
    ? 'Client de passage : aucune dette à réduire.'
    : vente.resteDu === 0
      ? 'Cette vente est déjà réglée : rien à déduire.'
      : montant > vente.resteDu
        ? `Le retour dépasse le reste dû de la vente (${gnf(vente.resteDu)}) : remboursez en espèces.`
        : null;
  // Le choix « déduire » devient impossible quand le montant dépasse le reste dû.
  const compensationEffective: CompensationRetour = compensation === 'DEDUIRE_DETTE' && !deductionPossible ? 'REMBOURSEMENT' : compensation;
  const soldeAvant = situation.data?.solde;
  const soldeApres = soldeAvant === undefined ? undefined : soldeAvant - (compensationEffective === 'DEDUIRE_DETTE' ? montant : 0);

  const retourner = useMutation({
    mutationFn: async (v: Formulaire) =>
      (
        await api.post<RetourClientCree>(`/ventes/${vente.id}/retour`, {
          lignes: vente.lignes.map((l, i) => ({ ligneVenteId: l.id, quantite: v.quantites[i] })).filter((l) => l.quantite > 0),
          etat: v.etat,
          ...(v.etat === 'CASSE' ? { motifPerte: v.motifPerte } : {}),
          ...(v.etat === 'RETOUR_FOURNISSEUR' ? { fournisseurId: v.fournisseurId } : {}),
          compensation: compensationEffective,
          ...(v.commentaire?.trim() ? { commentaire: v.commentaire.trim() } : {}),
        })
      ).data,
    onSuccess: (retour) => {
      for (const cle of [
        'ventes',
        'creances',
        'clients',
        'stock',
        'mouvements',
        'alertes',
        'dashboard',
        'pertes',
        'retours-fournisseur',
        'lots',
      ]) {
        queryClient.invalidateQueries({ queryKey: [cle] });
      }
      onRetourne(retour);
    },
    onError: (e) => setErreur(messageErreur(e, 'Le retour n’a pas pu être enregistré.')),
  });

  const choisirEtat = (e: EtatRetourClient) => setValue('etat', e, { shouldDirty: true });
  const idFormulaire = 'formulaire-retour-client';

  return (
    <Modal
      ouvert
      large
      onFermer={onFermer}
      titre={`Retour sur la vente ${vente.numero}`}
      description={vente.client ? `Client : ${vente.client.nom}` : 'Client de passage'}
      modifie={formState.isDirty}
      pied={
        <>
          <Button type="button" variant="secondary" onClick={onFermer}>
            Annuler
          </Button>
          <Button type="submit" form={idFormulaire} loading={retourner.isPending} disabled={unites === 0}>
            Enregistrer le retour{montant > 0 ? ` · ${gnf(montant)}` : ''}
          </Button>
        </>
      }
    >
      <form
        id={idFormulaire}
        noValidate
        onSubmit={handleSubmit((v) => {
          setErreur(null);
          retourner.mutate(v);
        })}
        className="flex flex-col gap-5"
      >
        {erreur && <Alert variant="error">{erreur}</Alert>}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-corps font-medium text-ink-900">Marchandise rapportée</legend>
          <ul className="divide-y divide-rule rounded-[9px] border border-rule">
            {vente.lignes.map((l, i) => {
              const q = quantites[i] ?? 0;
              const max = retournables[i];
              const deja = l.quantite - max;
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1 basis-full sm:basis-0">
                    <p className="truncate text-corps font-medium text-ink-900">{l.libelle}</p>
                    <p className="text-meta text-steel-500">
                      Vendu {formatNombre(l.quantite)} × {gnf(l.prixUnitaire)}
                      {deja > 0 && ` · ${formatNombre(deja)} déjà retourné${deja > 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      icone
                      aria-label={`Retirer un ${l.libelle}`}
                      disabled={q <= 0}
                      onClick={() => setValue(`quantites.${i}`, q - 1, { shouldDirty: true, shouldValidate: formState.isSubmitted })}
                    >
                      <Minus className="size-4" aria-hidden="true" />
                    </Button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={max}
                      aria-label={`Quantité retournée de ${l.libelle}`}
                      value={q}
                      disabled={max === 0}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        setValue(`quantites.${i}`, Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0, {
                          shouldDirty: true,
                          shouldValidate: formState.isSubmitted,
                        });
                      }}
                      className="h-10 w-16 rounded-[9px] border border-rule-strong bg-surface text-center text-corps font-semibold text-ink-900"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      icone
                      aria-label={`Ajouter un ${l.libelle}`}
                      disabled={q >= max}
                      onClick={() => setValue(`quantites.${i}`, q + 1, { shouldDirty: true, shouldValidate: formState.isSubmitted })}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <span className="ml-auto w-28 text-right text-corps font-medium whitespace-nowrap text-ink-900">{montants[i] > 0 ? gnf(montants[i]) : '—'}</span>
                </li>
              );
            })}
          </ul>
          {formState.errors.quantites?.root && <p className="text-meta text-rupture">{formState.errors.quantites.root.message}</p>}
          {formState.errors.quantites?.message && <p className="text-meta text-rupture">{formState.errors.quantites.message}</p>}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-corps font-medium text-ink-900">État de la marchandise</legend>
          <OptionCarte
            nom="etat-retour"
            valeur="REMISE_EN_STOCK"
            actif={etat === 'REMISE_EN_STOCK'}
            onChoisir={() => choisirEtat('REMISE_EN_STOCK')}
            titre="Remettre en stock"
            consequence={`Intacte : elle revient dans le stock de ${vente.emplacement.nom}, revendable tout de suite.`}
          />
          <OptionCarte
            nom="etat-retour"
            valeur="CASSE"
            actif={etat === 'CASSE'}
            onChoisir={() => choisirEtat('CASSE')}
            titre="Déclarer en casse"
            consequence={`Elle rentre puis ressort en casse : le stock ne bouge pas, la perte est comptée au prix d’achat${valeurAchat > 0 ? ` (${gnf(valeurAchat)})` : ''}.`}
          >
            <div className="grid grid-cols-2 gap-2">
              {[...MOTIFS_PRINCIPAUX, 'AUTRE' as const].map((m) => (
                <BoutonMotif
                  key={m}
                  motif={m}
                  actif={motifPerte === m}
                  page={false}
                  onChoisir={(v) => setValue('motifPerte', v, { shouldDirty: true, shouldValidate: true })}
                >
                  {m === 'AUTRE' ? 'Autre motif' : MOTIFS[m].court}
                </BoutonMotif>
              ))}
            </div>
            {formState.errors.motifPerte && <p className="text-meta text-rupture">{formState.errors.motifPerte.message}</p>}
          </OptionCarte>
          <OptionCarte
            nom="etat-retour"
            valeur="RETOUR_FOURNISSEUR"
            actif={etat === 'RETOUR_FOURNISSEUR'}
            onChoisir={() => choisirEtat('RETOUR_FOURNISSEUR')}
            titre="Renvoyer au fournisseur"
            consequence={`Elle rentre puis repart chez le fournisseur : un avoir${valeurAchat > 0 ? ` de ${gnf(valeurAchat)}` : ''} est attendu.`}
          >
            <SelecteurChamp
              name="fournisseurId"
              control={control}
              aria-label="Fournisseur"
              placeholder="À quel fournisseur ?"
              options={(fournisseurs.data ?? []).filter((f) => !f.archive).map((f) => ({ valeur: f.id, libelle: f.nom }))}
              vide={{ titre: 'Aucun fournisseur trouvé', nomPluriel: 'fournisseurs' }}
            />
          </OptionCarte>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-corps font-medium text-ink-900">Dédommagement du client</legend>
          <OptionCarte
            nom="compensation-retour"
            valeur="DEDUIRE_DETTE"
            actif={compensationEffective === 'DEDUIRE_DETTE'}
            desactive={!deductionPossible}
            onChoisir={() => setValue('compensation', 'DEDUIRE_DETTE', { shouldDirty: true })}
            titre="Déduire de sa dette"
            consequence={raisonDeduction ?? 'Un avoir est enregistré sur la vente : son reste dû baisse d’autant.'}
          />
          <OptionCarte
            nom="compensation-retour"
            valeur="REMBOURSEMENT"
            actif={compensationEffective === 'REMBOURSEMENT'}
            onChoisir={() => setValue('compensation', 'REMBOURSEMENT', { shouldDirty: true })}
            titre="Rembourser en espèces"
            consequence="Vous rendez l’argent au comptoir ; la dette du client n’est pas modifiée."
          />
        </fieldset>

        <section aria-label="Récapitulatif" className="flex flex-col gap-2 rounded-md bg-paper px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-corps text-ink-900">
              Retour de {formatNombre(unites)} unité{unites > 1 ? 's' : ''}
            </span>
            <span className="text-chiffre whitespace-nowrap text-ink-900">{gnf(montant)}</span>
          </div>
          {vente.client ? (
            <div className="flex items-baseline justify-between gap-3 border-t border-rule pt-2">
              <span className="text-corps text-steel-700">Dette de {vente.client.nom}</span>
              <span className="text-corps whitespace-nowrap text-ink-900">
                {soldeAvant === undefined ? '…' : gnf(soldeAvant)}
                {soldeApres !== undefined && soldeApres !== soldeAvant && (
                  <>
                    {' → '}
                    <strong className="font-semibold text-ok">{gnf(soldeApres)}</strong>
                  </>
                )}
              </span>
            </div>
          ) : null}
          <p className="text-meta text-steel-500">
            {compensationEffective === 'REMBOURSEMENT'
              ? `${gnf(montant)} à rendre au client en espèces.`
              : `${gnf(montant)} déduits du reste dû de la vente.`}
          </p>
        </section>
      </form>
    </Modal>
  );
}
