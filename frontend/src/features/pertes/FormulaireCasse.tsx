import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, Minus, Plus, X } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre, pluriel } from '@/lib/format';
import { gnf } from '@/lib/montant';
import { cn } from '@/lib/cn';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SelecteurChamp } from '@/components/ui/SelecteurChamp';
import { Vignette } from '@/components/patterns/Vignette';
import { datePeremption } from '@/features/peremptions/presentation';
import type { LotProduit } from '@/features/peremptions/types';
import { MOTIFS, MOTIFS_PRINCIPAUX } from './motifs';
import type { MotifPerte, Perte } from './types';

interface ProduitCasse {
  id: string;
  nom: string;
  reference: string | null;
  photoUrl: string | null;
  uniteMesure: string | null;
  prixAchat: number | null;
  suiviParLot: boolean;
  archive: boolean;
}

const schema = z.object({
  produitId: z.string().min(1, 'Choisissez le produit.'),
  // Facultatif : avec un seul dépôt, le champ n'est pas affiché (premier dépôt actif).
  emplacementId: z.string().optional(),
  lotId: z.string().optional(),
  quantite: z
    .number({ message: 'Indiquez la quantité.' })
    .int('La quantité doit être un nombre entier.')
    .min(1, 'La quantité doit être supérieure à 0.'),
  motif: z.enum(['CASSE_MANUTENTION', 'DEGAT_EAUX', 'VOL', 'ERREUR_SAISIE', 'AUTRE'], {
    message: 'Choisissez le motif : sans lui, la perte ne dit rien.',
  }),
  commentaire: z.string().max(500, '500 caractères au maximum.').optional(),
});
type Formulaire = z.infer<typeof schema>;

const TYPES_PHOTO = ['image/jpeg', 'image/png', 'image/webp'];

/** Photo facultative : bouton pleine largeur, appareil photo arrière sur mobile. */
function ChampPhoto({ valeur, onChange }: { valeur?: string; onChange: (url: string | undefined) => void }) {
  const entree = useRef<HTMLInputElement>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(fichier: File | undefined) {
    if (!fichier) return;
    if (!TYPES_PHOTO.includes(fichier.type)) return setErreur('Seules les images JPEG, PNG ou WEBP sont acceptées.');
    if (fichier.size > 5 * 1024 * 1024) return setErreur('Image trop volumineuse (5 Mo maximum).');
    setErreur(null);
    setEnCours(true);
    try {
      const donnees = new FormData();
      donnees.append('fichier', fichier);
      const { data } = await api.post<{ url: string }>('/uploads/image?type=pertes', donnees, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(data.url);
    } catch (e) {
      setErreur(messageErreur(e, 'L’envoi de la photo a échoué.'));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {valeur ? (
        <div className="flex items-center gap-3 rounded-md border border-rule p-2">
          <img src={valeur} alt="Photo de la casse" className="size-14 rounded-md object-cover" />
          <span className="flex-1 text-corps text-ink-900">Photo jointe</span>
          <Button type="button" variant="ghost" icone aria-label="Retirer la photo" onClick={() => onChange(undefined)}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" className="w-full max-md:h-12" loading={enCours} onClick={() => entree.current?.click()}>
          <Camera className="size-4" aria-hidden="true" />
          Ajouter une photo (facultatif)
        </Button>
      )}
      <input
        ref={entree}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        aria-label="Photo de la casse"
        onChange={(e) => {
          void envoyer(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {erreur && <p className="text-meta text-rupture">{erreur}</p>}
    </div>
  );
}

/**
 * Déclaration d'une casse. Même formulaire en fenêtre (bureau) et en
 * pleine page (mobile, au dépôt) : quantité au pavé large, motifs en
 * grille, photo pleine largeur, valeur perdue calculée en direct, bouton
 * de validation toujours visible.
 */
export function FormulaireCasse({
  presentation,
  onFermer,
  onDeclaree,
  produitInitial,
}: {
  presentation: 'fenetre' | 'page';
  onFermer: () => void;
  onDeclaree: (pertes: Perte[]) => void;
  produitInitial?: string;
}) {
  const queryClient = useQueryClient();
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);

  const produits = useQuery({
    queryKey: ['produits', '', false],
    queryFn: async () => (await api.get<ProduitCasse[]>('/produits')).data,
  });
  const emplacements = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<{ id: string; nom: string; archive: boolean }[]>('/emplacements')).data,
  });
  const actifs = (emplacements.data ?? []).filter((e) => !e.archive);

  const { register, handleSubmit, control, setValue, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
    defaultValues: { produitId: produitInitial ?? '', emplacementId: '', lotId: '', quantite: 1, commentaire: '' },
  });
  const produitId = useWatch({ control, name: 'produitId' });
  const emplacementChoisi = useWatch({ control, name: 'emplacementId' });
  const quantite = useWatch({ control, name: 'quantite' });
  const motif = useWatch({ control, name: 'motif' });
  const produit = produits.data?.find((p) => p.id === produitId);

  // Stock du produit dans chaque dépôt : sans choix explicite, la casse vise
  // le dépôt qui en détient le plus (le premier dépôt par ordre alphabétique
  // pouvait n'en avoir aucun).
  const stock = useQuery({
    queryKey: ['stock', { produitId }],
    queryFn: async () =>
      (await api.get<{ quantite: number; emplacementId: string }[]>(`/stock?produit_id=${produitId}`)).data,
    enabled: !!produitId,
  });
  const stockPar = new Map((stock.data ?? []).map((l) => [l.emplacementId, l.quantite]));
  const mieuxPourvu = [...actifs].sort((a, b) => (stockPar.get(b.id) ?? 0) - (stockPar.get(a.id) ?? 0))[0];
  const emplacementId = emplacementChoisi || mieuxPourvu?.id || '';
  const lots = useQuery({
    queryKey: ['lots', produitId, emplacementId],
    queryFn: async () => (await api.get<LotProduit[]>(`/produits/${produitId}/lots?emplacement_id=${emplacementId}`)).data,
    enabled: !!produit?.suiviParLot && !!emplacementId,
  });
  const disponible = stockPar.get(emplacementId) ?? 0;
  const q = Number.isFinite(quantite) && quantite > 0 ? quantite : 0;
  const valeur = q * (produit?.prixAchat ?? 0);

  const declarer = useMutation({
    mutationFn: async (v: Formulaire) =>
      (
        await api.post<Perte[]>('/pertes', {
          produitId: v.produitId,
          emplacementId,
          quantite: v.quantite,
          motif: v.motif,
          ...(v.commentaire?.trim() ? { commentaire: v.commentaire.trim() } : {}),
          ...(photoUrl ? { photoUrl } : {}),
          ...(v.lotId ? { lotId: v.lotId } : {}),
        })
      ).data,
    onSuccess: (pertes) => {
      for (const cle of ['pertes', 'stock', 'mouvements', 'alertes', 'dashboard', 'lots', 'peremptions']) {
        queryClient.invalidateQueries({ queryKey: [cle] });
      }
      onDeclaree(pertes);
    },
    onError: (e) => setErreur(messageErreur(e, 'La déclaration a échoué.')),
  });

  const page = presentation === 'page';
  const idFormulaire = 'formulaire-casse';
  const enregistrer = (
    <Button type="submit" form={idFormulaire} variant="danger" loading={declarer.isPending} className={cn(page && 'h-12 w-full')}>
      Déclarer la perte{valeur > 0 ? ` · ${gnf(valeur)}` : ''}
    </Button>
  );

  const corps = (
    <form
      id={idFormulaire}
      noValidate
      onSubmit={handleSubmit((v) => {
        setErreur(null);
        declarer.mutate(v);
      })}
      className="flex flex-col gap-4"
    >
      {erreur && <Alert variant="error">{erreur}</Alert>}
      <SelecteurChamp
        name="produitId"
        control={control}
        label="Produit"
        placeholder="Quel produit ?"
        options={(produits.data ?? [])
          .filter((p) => !p.archive)
          .map((p) => ({
            valeur: p.id,
            libelle: p.nom,
            sousTitre: p.reference ?? undefined,
            icone: <Vignette nom={p.nom} photoUrl={p.photoUrl} taille={28} />,
          }))}
        vide={{ titre: 'Aucune référence trouvée', nomPluriel: 'références' }}
      />
      {actifs.length > 1 && (
        <SelecteurChamp
          name="emplacementId"
          control={control}
          label="Dépôt"
          placeholder={mieuxPourvu?.nom}
          options={actifs.map((e) => ({
            valeur: e.id,
            libelle: e.nom,
            sousTitre: produit ? `${formatNombre(stockPar.get(e.id) ?? 0)} en stock` : undefined,
          }))}
        />
      )}
      {produit?.suiviParLot && (
        <SelecteurChamp
          name="lotId"
          control={control}
          label="Lot"
          options={[
            { valeur: '', libelle: 'Ordre des péremptions (automatique)' },
            ...(lots.data ?? []).map((l) => ({
              valeur: l.id,
              libelle: l.numero,
              sousTitre: `${l.quantite} en stock · ${l.datePeremption ? `périme le ${datePeremption(l.datePeremption)}` : 'sans date'}`,
            })),
          ]}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="quantite-casse" className="text-corps font-medium text-ink-900">
          Quantité perdue
        </label>
        <div className="flex items-stretch gap-2">
          <Button
            type="button"
            variant="secondary"
            icone
            className={cn(page ? 'size-14' : 'size-10')}
            aria-label="Diminuer"
            onClick={() => setValue('quantite', Math.max(1, q - 1), { shouldDirty: true })}
          >
            <Minus className="size-5" aria-hidden="true" />
          </Button>
          <input
            id="quantite-casse"
            type="number"
            inputMode="numeric"
            min={1}
            {...register('quantite', { valueAsNumber: true })}
            className={cn(
              'min-w-0 flex-1 rounded-[9px] border border-rule-strong bg-surface text-center font-semibold text-ink-900 outline-none focus:border-action focus:shadow-[0_0_0_3px_rgba(34,66,199,.12)]',
              page ? 'h-14 text-[28px]' : 'h-10 text-panneau',
            )}
          />
          <Button
            type="button"
            variant="secondary"
            icone
            className={cn(page ? 'size-14' : 'size-10')}
            aria-label="Augmenter"
            onClick={() => setValue('quantite', q + 1, { shouldDirty: true })}
          >
            <Plus className="size-5" aria-hidden="true" />
          </Button>
        </div>
        {formState.errors.quantite ? (
          <p className="text-meta text-rupture">{formState.errors.quantite.message}</p>
        ) : (
          produit && (
            <p className={cn('text-meta', q > disponible ? 'text-rupture' : 'text-steel-500')}>
              {formatNombre(disponible)} {pluriel('unité', disponible)} en stock dans ce dépôt
            </p>
          )
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-corps font-medium text-ink-900">Motif</legend>
        <div className="grid grid-cols-2 gap-2">
          {MOTIFS_PRINCIPAUX.map((m) => (
            <BoutonMotif key={m} motif={m} actif={motif === m} page={page} onChoisir={(v) => setValue('motif', v, { shouldDirty: true, shouldValidate: true })}>
              {MOTIFS[m].court}
            </BoutonMotif>
          ))}
        </div>
        <BoutonMotif motif="AUTRE" actif={motif === 'AUTRE'} page={page} onChoisir={(v) => setValue('motif', v, { shouldDirty: true, shouldValidate: true })}>
          Autre motif
        </BoutonMotif>
        {formState.errors.motif && <p className="text-meta text-rupture">{formState.errors.motif.message}</p>}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="precision-casse" className="text-corps font-medium text-ink-900">
          Précision (facultatif)
        </label>
        <textarea
          id="precision-casse"
          rows={2}
          maxLength={500}
          placeholder="Ex. sacs éventrés au déchargement du camion"
          {...register('commentaire')}
          className="rounded-[9px] border border-rule-strong bg-surface px-3 py-2 text-corps text-ink-900 placeholder:text-steel-400 focus:border-action focus:outline-none"
        />
      </div>

      <ChampPhoto valeur={photoUrl} onChange={setPhotoUrl} />

      {produit && q > 0 && (
        <div className="rounded-lg border border-rupture/25 bg-rupture-wash px-4 py-3" role="status">
          <p className="text-meta font-medium text-rupture">Valeur perdue</p>
          {produit.prixAchat ? (
            <p className="mt-0.5 text-corps text-ink-900">
              {formatNombre(q)} × {formatNombre(produit.prixAchat)} au prix d’achat ={' '}
              <strong className="text-rupture">{gnf(valeur)}</strong>
            </p>
          ) : (
            <p className="mt-0.5 text-corps text-ink-900">
              Prix d’achat non renseigné : la perte sera enregistrée à 0 GNF. Complétez la fiche produit.
            </p>
          )}
        </div>
      )}
    </form>
  );

  if (!page) {
    return (
      <Modal
        ouvert
        onFermer={onFermer}
        titre="Déclarer une casse"
        description="La perte est enregistrée à votre nom et ne pourra plus être modifiée."
        modifie={formState.isDirty || !!photoUrl}
        large
        pied={
          <>
            <Button type="button" variant="secondary" onClick={onFermer}>
              Annuler
            </Button>
            {enregistrer}
          </>
        }
      >
        {corps}
      </Modal>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-24">
      <div>
        <h1 className="text-titre text-ink-900">Déclarer une casse</h1>
        <p className="mt-1 text-corps text-steel-500">Enregistrée à votre nom, elle ne pourra plus être modifiée.</p>
      </div>
      {corps}
      {/* Validation fixe en bas, au-dessus de la barre de navigation mobile. */}
      <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-30 flex gap-2 border-t border-rule bg-surface px-4 py-3 md:static md:border-0 md:bg-transparent md:p-0">
        <Button type="button" variant="secondary" className="h-12 md:h-9" onClick={onFermer}>
          Annuler
        </Button>
        <div className="flex-1">{enregistrer}</div>
      </div>
    </div>
  );
}

export function BoutonMotif({
  motif,
  actif,
  page,
  onChoisir,
  children,
}: {
  motif: MotifPerte;
  actif: boolean;
  page: boolean;
  onChoisir: (motif: MotifPerte) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={() => onChoisir(motif)}
      className={cn(
        'flex items-center justify-center gap-2 rounded-[9px] border px-3 text-corps font-medium transition-colors',
        page ? 'h-12' : 'h-10',
        actif ? 'border-action bg-action-wash text-action' : 'border-rule-strong text-ink-900 hover:bg-paper',
      )}
    >
      <span className={cn('size-2 shrink-0 rounded-full', MOTIFS[motif].fond)} aria-hidden="true" />
      {children}
    </button>
  );
}
