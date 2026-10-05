import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre } from '@/lib/format';
import { gnf } from '@/lib/montant';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SelecteurChamp } from '@/components/ui/SelecteurChamp';
import { Vignette } from '@/components/patterns/Vignette';
import type { RetourFournisseur } from './types';

interface ProduitRetour {
  id: string;
  nom: string;
  reference: string | null;
  photoUrl: string | null;
  prixAchat: number | null;
  archive: boolean;
}

const schema = z.object({
  fournisseurId: z.string().min(1, 'Choisissez le fournisseur.'),
  emplacementId: z.string().optional(),
  motif: z.string().trim().min(3, 'Indiquez pourquoi la marchandise repart.').max(300, '300 caractères au maximum.'),
  lignes: z
    .array(
      z.object({
        produitId: z.string().min(1, 'Choisissez le produit.'),
        quantite: z
          .number({ message: 'Indiquez la quantité.' })
          .int('La quantité doit être un nombre entier.')
          .min(1, 'La quantité doit être supérieure à 0.'),
      }),
    )
    .min(1)
    .max(50, '50 lignes au maximum.'),
});
type Formulaire = z.infer<typeof schema>;

/**
 * Renvoi au fournisseur : le stock sort à la validation, valorisé au prix
 * d'achat ; l'avoir reste « attendu » jusqu'à sa réception ou son refus.
 */
export function FormulaireRetourFournisseur({ onFermer, onCree }: { onFermer: () => void; onCree: (retour: RetourFournisseur) => void }) {
  const queryClient = useQueryClient();
  const [erreur, setErreur] = useState<string | null>(null);

  const fournisseurs = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: async () => (await api.get<{ id: string; nom: string; archive?: boolean }[]>('/fournisseurs')).data,
  });
  const produits = useQuery({
    queryKey: ['produits', '', false],
    queryFn: async () => (await api.get<ProduitRetour[]>('/produits')).data,
  });
  const emplacements = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<{ id: string; nom: string; archive: boolean }[]>('/emplacements')).data,
  });
  const actifs = (emplacements.data ?? []).filter((e) => !e.archive);

  const { register, handleSubmit, control, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
    defaultValues: {
      fournisseurId: '',
      emplacementId: '',
      motif: '',
      lignes: [{ produitId: '', quantite: 1 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lignes' });
  const lignes = useWatch({ control, name: 'lignes' });
  const emplacementChoisi = useWatch({ control, name: 'emplacementId' });

  // Stock de chaque produit par dépôt : sans choix explicite, le retour part
  // du dépôt qui détient le plus des produits choisis (le premier par ordre
  // alphabétique peut n'en avoir aucun).
  const stock = useQuery({
    queryKey: ['stock'],
    queryFn: async () => (await api.get<{ produitId: string; emplacementId: string; quantite: number }[]>('/stock')).data,
  });
  const quantiteEn = (produitId: string, emplacement: string) =>
    stock.data?.find((l) => l.produitId === produitId && l.emplacementId === emplacement)?.quantite ?? 0;
  const choisis = (lignes ?? []).map((l) => l.produitId).filter(Boolean);
  const totalEn = (emplacement: string) => choisis.reduce((a, id) => a + quantiteEn(id, emplacement), 0);
  const mieuxPourvu = [...actifs].sort((a, b) => totalEn(b.id) - totalEn(a.id))[0];
  const emplacementId = emplacementChoisi || mieuxPourvu?.id || '';

  const prixPar = new Map((produits.data ?? []).map((p) => [p.id, p.prixAchat ?? 0]));
  const total = (lignes ?? []).reduce((somme, l) => {
    const q = Number.isFinite(l.quantite) && l.quantite > 0 ? l.quantite : 0;
    return somme + q * (prixPar.get(l.produitId) ?? 0);
  }, 0);

  const creer = useMutation({
    mutationFn: async (v: Formulaire) =>
      (
        await api.post<RetourFournisseur>('/retours-fournisseur', {
          fournisseurId: v.fournisseurId,
          emplacementId,
          motif: v.motif.trim(),
          lignes: v.lignes,
        })
      ).data,
    onSuccess: (retour) => {
      for (const cle of ['retours-fournisseur', 'pertes', 'stock', 'mouvements', 'alertes', 'dashboard', 'lots']) {
        queryClient.invalidateQueries({ queryKey: [cle] });
      }
      onCree(retour);
    },
    onError: (e) => setErreur(messageErreur(e, 'Le retour n’a pas pu être enregistré.')),
  });

  const optionsProduits = (produits.data ?? [])
    .filter((p) => !p.archive)
    .map((p) => ({
      valeur: p.id,
      libelle: p.nom,
      sousTitre: p.prixAchat ? `${gnf(p.prixAchat)} à l’achat` : (p.reference ?? undefined),
      icone: <Vignette nom={p.nom} photoUrl={p.photoUrl} taille={28} />,
    }));
  const idFormulaire = 'formulaire-retour-fournisseur';

  return (
    <Modal
      ouvert
      large
      onFermer={onFermer}
      titre="Renvoyer au fournisseur"
      description="La marchandise sort du stock maintenant ; l’avoir reste attendu jusqu’à sa réception."
      modifie={formState.isDirty}
      pied={
        <>
          <Button variant="secondary" onClick={onFermer}>
            Annuler
          </Button>
          <Button type="submit" form={idFormulaire} loading={creer.isPending}>
            Enregistrer le retour{total > 0 ? ` · ${gnf(total)}` : ''}
          </Button>
        </>
      }
    >
      <form
        id={idFormulaire}
        noValidate
        onSubmit={handleSubmit((v) => {
          setErreur(null);
          creer.mutate(v);
        })}
        className="flex flex-col gap-4"
      >
        {erreur && <Alert variant="error">{erreur}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelecteurChamp
            name="fournisseurId"
            control={control}
            label="Fournisseur"
            placeholder="À qui renvoyer ?"
            options={(fournisseurs.data ?? []).filter((f) => !f.archive).map((f) => ({ valeur: f.id, libelle: f.nom }))}
            vide={{
              titre: 'Aucun fournisseur trouvé',
              nomPluriel: 'fournisseurs',
            }}
          />
          {actifs.length > 1 && (
            <SelecteurChamp
              name="emplacementId"
              control={control}
              label="Dépôt de sortie"
              placeholder={mieuxPourvu?.nom}
              options={actifs.map((e) => ({
                valeur: e.id,
                libelle: e.nom,
                sousTitre: choisis.length > 0 ? `${formatNombre(totalEn(e.id))} en stock pour ce retour` : undefined,
              }))}
            />
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-corps font-medium text-ink-900">Marchandise renvoyée</legend>
          {fields.map((champ, index) => {
            const ligne = lignes?.[index];
            const q = ligne && Number.isFinite(ligne.quantite) && ligne.quantite > 0 ? ligne.quantite : 0;
            const valeur = q * (prixPar.get(ligne?.produitId ?? '') ?? 0);
            const erreurs = formState.errors.lignes?.[index];
            return (
              <div key={champ.id} className="flex flex-wrap items-start gap-2 rounded-md border border-rule p-2 sm:flex-nowrap">
                <SelecteurChamp
                  name={`lignes.${index}.produitId`}
                  control={control}
                  aria-label={`Produit de la ligne ${index + 1}`}
                  placeholder="Produit"
                  options={optionsProduits}
                  vide={{
                    titre: 'Aucune référence trouvée',
                    nomPluriel: 'références',
                  }}
                  className="min-w-0 flex-1 basis-full sm:basis-auto"
                />
                <label className="flex flex-col gap-1">
                  <span className="sr-only">Quantité de la ligne {index + 1}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    {...register(`lignes.${index}.quantite`, {
                      valueAsNumber: true,
                    })}
                    aria-invalid={erreurs?.quantite ? true : undefined}
                    className="h-10 w-24 rounded-[9px] border border-rule-strong bg-surface px-3 text-right text-corps text-ink-900"
                  />
                  {erreurs?.quantite && <span className="text-meta text-rupture">{erreurs.quantite.message}</span>}
                </label>
                <span className="flex h-10 min-w-28 flex-1 items-center justify-end text-corps font-medium text-ink-900 sm:flex-none">
                  {valeur > 0 ? gnf(valeur) : '—'}
                </span>
                <Button
                  variant="ghost"
                  icone
                  aria-label={`Retirer la ligne ${index + 1}`}
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            );
          })}
          {formState.errors.lignes?.root && <p className="text-meta text-rupture">{formState.errors.lignes.root.message}</p>}
          <Button
            variant="secondary"
            className="self-start"
            disabled={fields.length >= 50}
            onClick={() => append({ produitId: '', quantite: 1 })}
          >
            <Plus className="size-4" aria-hidden="true" />
            Ajouter un produit
          </Button>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="text-corps font-medium text-ink-900">Motif du retour</span>
          <textarea
            rows={2}
            {...register('motif')}
            placeholder="Ex. barres tordues à la livraison, mauvaise référence…"
            aria-invalid={formState.errors.motif ? true : undefined}
            className="rounded-[9px] border border-rule-strong bg-surface px-3 py-2 text-corps text-ink-900"
          />
          {formState.errors.motif && <span className="text-meta text-rupture">{formState.errors.motif.message}</span>}
        </label>

        <div className="flex items-baseline justify-between gap-3 rounded-md bg-faible-wash px-4 py-3">
          <span className="text-corps text-ink-900">
            Avoir à réclamer · {formatNombre((lignes ?? []).length)} ligne
            {(lignes ?? []).length > 1 ? 's' : ''}, au prix d’achat
          </span>
          <span className="shrink-0 text-chiffre whitespace-nowrap text-faible">{gnf(total)}</span>
        </div>
      </form>
    </Modal>
  );
}
