import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Truck } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SelecteurChamp } from '@/components/ui/SelecteurChamp';
import { ModaleNom } from '@/components/patterns/ModaleNom';
import { useSession } from '@/lib/useSession';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { ImageUploadField } from '@/components/patterns/ImageUploadField';
import { Card } from '@/components/patterns/Page';
import { LoadingState, ErrorState } from '@/components/patterns/States';
import { cn } from '@/lib/cn';
import { LotsDuProduit } from '@/features/peremptions/LotsDuProduit';

interface ElementReference {
  id: string;
  nom: string;
}

interface ProduitDetail {
  id: string;
  nom: string;
  reference: string | null;
  seuilAlerte: number;
  photoUrl: string | null;
  prixAchat: number | null;
  prixVente: number | null;
  prixGros: number | null;
  prixDemiGros: number | null;
  tauxTva: number | null;
  codeBarre: string | null;
  description: string | null;
  uniteMesure: string | null;
  categorie: ElementReference | null;
  marque: ElementReference | null;
  fournisseursAssocies: { fournisseur: ElementReference }[];
  suiviParLot: boolean;
  seuilAlertePeremption: number | null;
}

const schema = z.object({
  nom: z.string().min(1, 'Le nom du produit est requis.'),
  reference: z.string().optional(),
  seuilAlerte: z
    .number({ message: 'Le seuil doit être un nombre.' })
    .int('Le seuil doit être un nombre entier.')
    .min(0, 'Le seuil ne peut pas être négatif.'),
  prixAchat: z.union([z.number().int().min(0), z.nan()]).optional(),
  prixVente: z.union([z.number().int().min(0), z.nan()]).optional(),
  prixGros: z.union([z.number().int().min(0), z.nan()]).optional(),
  prixDemiGros: z.union([z.number().int().min(0), z.nan()]).optional(),
  tauxTva: z.union([z.number().int().min(0).max(100), z.nan()]).optional(),
  codeBarre: z.string().optional(),
  description: z.string().optional(),
  categorieId: z.string().optional(),
  marqueId: z.string().optional(),
  uniteMesure: z.string().optional(),
  suiviParLot: z.boolean(),
  seuilAlertePeremption: z
    .union([
      z.number().int('Nombre entier de jours.').min(1, 'Au moins 1 jour.').max(3650, 'Au plus 3 650 jours.'),
      z.nan(),
    ])
    .optional(),
});

type Formulaire = z.infer<typeof schema>;

function nombreOuIndefini(valeur: number | undefined): number | undefined {
  return valeur === undefined || Number.isNaN(valeur) ? undefined : valeur;
}

const FORMATEUR_GNF = new Intl.NumberFormat('fr-FR');
const UNITES = ['Unité', 'Sac', 'Barre', 'Boîte', 'Carton', 'Rouleau', 'Paire', 'Litre', 'Kg', 'Mètre', 'm²'];

export function ProduitFormPage() {
  const { id } = useParams<{ id?: string }>();
  // « Créer ce produit » depuis un sélecteur : le nom cherché pré-remplit la fiche.
  const [parametres] = useSearchParams();
  const estAdmin = useSession()?.utilisateur.role === 'ADMIN';
  const [creation, setCreation] = useState<{ type: 'categorie' | 'marque'; terme: string } | null>(null);
  const enEdition = id !== undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [erreur, setErreur] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [dernierEnregistrementLocal, setDernierEnregistrementLocal] = useState<Date | null>(null);

  const produit = useQuery({
    queryKey: ['produit', id],
    queryFn: async () => (await api.get<ProduitDetail>(`/produits/${id}`)).data,
    enabled: enEdition,
  });

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<ElementReference[]>('/categories')).data,
  });
  const marques = useQuery({
    queryKey: ['marques'],
    queryFn: async () => (await api.get<ElementReference[]>('/marques')).data,
  });
  // Uniquement pour pré-remplir le taux de TVA en création — inutile en
  // édition, où la valeur enregistrée du produit prévaut toujours.
  const entreprise = useQuery({
    queryKey: ['entreprise'],
    queryFn: async () => (await api.get<{ tauxTvaParDefaut: number | null }>('/entreprise')).data,
    enabled: !enEdition,
  });

  const { register, handleSubmit, reset, setValue, watch, control, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
    defaultValues: { nom: parametres.get('nom') ?? '', seuilAlerte: 0, suiviParLot: false },
  });
  const suiviParLot = useWatch({ control, name: 'suiviParLot' });

  // Pré-remplit le taux de TVA depuis le défaut de l'entreprise — en
  // création seulement, et seulement si la personne n'a encore rien
  // saisi dans ce champ (ne doit jamais écraser une valeur déjà tapée).
  useEffect(() => {
    if (enEdition || entreprise.data?.tauxTvaParDefaut === undefined || entreprise.data?.tauxTvaParDefaut === null) {
      return;
    }
    if (!formState.dirtyFields.tauxTva) {
      setValue('tauxTva', entreprise.data.tauxTvaParDefaut);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entreprise.data, enEdition]);

  // Remplit le formulaire une fois le produit chargé (mode édition).
  useEffect(() => {
    if (!produit.data) return;
    setPhotoUrl(produit.data.photoUrl ?? undefined);
    reset({
      nom: produit.data.nom,
      reference: produit.data.reference ?? '',
      seuilAlerte: produit.data.seuilAlerte,
      prixAchat: produit.data.prixAchat ?? undefined,
      prixVente: produit.data.prixVente ?? undefined,
      prixGros: produit.data.prixGros ?? undefined,
      prixDemiGros: produit.data.prixDemiGros ?? undefined,
      tauxTva: produit.data.tauxTva ?? undefined,
      codeBarre: produit.data.codeBarre ?? '',
      description: produit.data.description ?? '',
      categorieId: produit.data.categorie?.id ?? '',
      marqueId: produit.data.marque?.id ?? '',
      uniteMesure: produit.data.uniteMesure ?? '',
      suiviParLot: produit.data.suiviParLot,
      seuilAlertePeremption: produit.data.seuilAlertePeremption ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produit.data]);

  const valeurs = watch();

  // Repère local de saisie en cours — pas un vrai brouillon persistant
  // côté serveur, juste un indicateur rassurant pendant la frappe.
  useEffect(() => {
    if (!formState.isDirty) return;
    const minuteur = setTimeout(() => setDernierEnregistrementLocal(new Date()), 600);
    return () => clearTimeout(minuteur);
  }, [valeurs, formState.isDirty]);

  const enregistrer = useMutation({
    mutationFn: async (v: Formulaire) => {
      const corps = {
        nom: v.nom,
        seuilAlerte: v.seuilAlerte,
        ...(v.reference ? { reference: v.reference } : {}),
        ...(nombreOuIndefini(v.prixAchat) !== undefined ? { prixAchat: v.prixAchat } : {}),
        ...(nombreOuIndefini(v.prixVente) !== undefined ? { prixVente: v.prixVente } : {}),
        ...(nombreOuIndefini(v.tauxTva) !== undefined ? { tauxTva: v.tauxTva } : {}),
        ...(v.codeBarre ? { codeBarre: v.codeBarre } : {}),
        ...(v.description ? { description: v.description } : {}),
        ...(v.categorieId ? { categorieId: v.categorieId } : {}),
        ...(v.marqueId ? { marqueId: v.marqueId } : {}),
        ...(v.uniteMesure ? { uniteMesure: v.uniteMesure } : {}),
        ...(photoUrl ? { photoUrl } : {}),
        suiviParLot: v.suiviParLot,
      };
      // Seuil de péremption vidé : null, le seuil de l'entreprise s'applique.
      const seuilAlertePeremption = v.suiviParLot ? (nombreOuIndefini(v.seuilAlertePeremption) ?? null) : null;
      // Prix de gros et demi-gros : vidés en modification, ils sont
      // effacés (null) et le produit retombe sur le prix de détail.
      const prixGros = nombreOuIndefini(v.prixGros);
      const prixDemiGros = nombreOuIndefini(v.prixDemiGros);
      if (enEdition) {
        await api.patch(`/produits/${id}`, {
          ...corps,
          prixGros: prixGros ?? null,
          prixDemiGros: prixDemiGros ?? null,
          seuilAlertePeremption,
        });
      } else {
        await api.post('/produits', {
          ...corps,
          ...(prixGros !== undefined ? { prixGros } : {}),
          ...(prixDemiGros !== undefined ? { prixDemiGros } : {}),
          ...(seuilAlertePeremption !== null ? { seuilAlertePeremption } : {}),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produits'] });
      queryClient.invalidateQueries({ queryKey: ['produit', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['peremptions'] });
      navigate('/produits');
    },
    onError: (err) => setErreur(messageErreur(err, 'L’enregistrement a échoué.')),
  });

  // Complétude de la fiche — indicateur purement visuel, calculé côté
  // client à partir des champs jugés importants pour un usage réel.
  const completude = useMemo(() => {
    const criteres = [
      { libelle: 'Nom renseigné', ok: !!valeurs.nom },
      { libelle: 'Tarification complète', ok: !!valeurs.prixAchat && !!valeurs.prixVente },
      { libelle: 'Seuil d’alerte défini', ok: (valeurs.seuilAlerte ?? 0) > 0 },
      { libelle: 'Catégorie choisie', ok: !!valeurs.categorieId },
      { libelle: 'Photo ajoutée', ok: !!photoUrl },
    ];
    const nombreOk = criteres.filter((c) => c.ok).length;
    return { pourcentage: Math.round((nombreOk / criteres.length) * 100), criteres };
  }, [valeurs, photoUrl]);

  const marge =
    valeurs.prixAchat && valeurs.prixVente && valeurs.prixAchat > 0
      ? Math.round(((valeurs.prixVente - valeurs.prixAchat) / valeurs.prixAchat) * 1000) / 10
      : null;
  const prixTtc =
    valeurs.prixVente && !Number.isNaN(valeurs.prixVente)
      ? Math.round(valeurs.prixVente * (1 + (valeurs.tauxTva ?? 0) / 100))
      : null;
  // Indice affiché dans les prix de gros vides : le prix qui s'appliquera.
  const prixDetailIndicatif =
    valeurs.prixVente && !Number.isNaN(valeurs.prixVente) ? `${FORMATEUR_GNF.format(valeurs.prixVente)} (détail)` : 'Prix de détail';

  const optionsCategories = [
    { valeur: '', libelle: 'Aucune' },
    ...(categories.data ?? []).map((c) => ({ valeur: c.id, libelle: c.nom })),
  ];
  const optionsMarques = [
    { valeur: '', libelle: 'Aucune' },
    ...(marques.data ?? []).map((m) => ({ valeur: m.id, libelle: m.nom })),
  ];

  if (enEdition && produit.isLoading) return <LoadingState variante="fiche" lignes={6} />;
  if (enEdition && produit.isError) {
    return (
      <ErrorState message={messageErreur(produit.error, 'Produit introuvable.')} onRetry={() => produit.refetch()} />
    );
  }

  const fournisseurHabituel = produit.data?.fournisseursAssocies[0]?.fournisseur;
  const uniteHorsListe =
    produit.data?.uniteMesure && !UNITES.includes(produit.data.uniteMesure) ? produit.data.uniteMesure : null;

  return (
    <>
      <form onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate>
        {/* Barre d'enregistrement collée sous la barre supérieure (60 px). */}
        <div className="sticky top-[60px] z-20 -mx-4 -mt-5 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur md:-mx-7 md:-mt-7 md:px-7">
          <h1 className="min-w-0 truncate text-[20px] leading-7 font-semibold tracking-[-0.006em] text-ink-900">
            {enEdition ? (produit.data?.nom ?? '…') : 'Nouveau produit'}
          </h1>

          <div className="flex items-center gap-3">
            {dernierEnregistrementLocal && (
              <span className="hidden text-meta text-steel-500 sm:inline">
                Brouillon local à{' '}
                {dernierEnregistrementLocal.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <Button type="button" variant="secondary" onClick={() => navigate('/produits')}>
              Annuler
            </Button>
            <Button type="submit" loading={enregistrer.isPending}>
              Enregistrer le produit
            </Button>
          </div>
        </div>

        {erreur && (
          <div className="mb-4">
            <Alert variant="error">{erreur}</Alert>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card>
              <div className="border-b border-rule px-5 py-4">
                <h2 className="text-panneau text-ink-900">Informations générales</h2>
                <p className="mt-0.5 text-meta text-steel-500">Ce que verront vos gestionnaires dans le catalogue</p>
              </div>
              <div className="flex flex-col gap-4 p-5">
                <Input label="Nom du produit" error={formState.errors.nom?.message} {...register('nom')} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <SelecteurChamp
                    name="categorieId"
                    control={control}
                    label="Catégorie"
                    options={optionsCategories}
                    vide={{ titre: 'Aucune catégorie trouvée', nomPluriel: 'catégories' }}
                    creation={
                      estAdmin
                        ? {
                            libelle: 'Créer une catégorie',
                            libelleDepuisRecherche: (terme) => `Créer « ${terme} »`,
                            onCreer: (terme) => setCreation({ type: 'categorie', terme }),
                          }
                        : undefined
                    }
                  />
                  <SelecteurChamp
                    name="marqueId"
                    control={control}
                    label="Marque"
                    options={optionsMarques}
                    vide={{ titre: 'Aucune marque trouvée', nomPluriel: 'marques' }}
                    creation={
                      estAdmin
                        ? {
                            libelle: 'Créer une marque',
                            libelleDepuisRecherche: (terme) => `Créer « ${terme} »`,
                            onCreer: (terme) => setCreation({ type: 'marque', terme }),
                          }
                        : undefined
                    }
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Code-barre (facultatif)"
                    placeholder="3401234567890"
                    className="font-mono"
                    error={formState.errors.codeBarre?.message}
                    {...register('codeBarre')}
                  />
                  <SelecteurChamp
                    name="uniteMesure"
                    control={control}
                    label="Unité de mesure"
                    options={[
                      { valeur: '', libelle: 'Non précisée' },
                      // Unité enregistrée hors de la liste (texte libre) : affichée telle quelle.
                      ...(uniteHorsListe ? [{ valeur: uniteHorsListe, libelle: uniteHorsListe }] : []),
                      { valeur: 'Unité', libelle: 'Unité' },
                      { valeur: 'Sac', libelle: 'Sac' },
                      { valeur: 'Barre', libelle: 'Barre' },
                      { valeur: 'Boîte', libelle: 'Boîte' },
                      { valeur: 'Carton', libelle: 'Carton' },
                      { valeur: 'Rouleau', libelle: 'Rouleau' },
                      { valeur: 'Paire', libelle: 'Paire' },
                      { valeur: 'Litre', libelle: 'Litre' },
                      { valeur: 'Kg', libelle: 'Kg' },
                      { valeur: 'Mètre', libelle: 'Mètre' },
                      { valeur: 'm²', libelle: 'm²' },
                    ]}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="description" className="text-corps font-medium text-ink-900">
                    Description (facultatif)
                  </label>
                  <textarea
                    id="description"
                    rows={3}
                    {...register('description')}
                    className="rounded-md border border-rule-strong bg-surface-elevee px-3 py-2 text-corps text-ink-900 placeholder:text-steel-400 hover:border-steel-400 focus:border-action"
                  />
                </div>
                <Input
                  label="Référence interne (facultatif)"
                  placeholder="VIS-440"
                  className="font-mono"
                  error={formState.errors.reference?.message}
                  {...register('reference')}
                />
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between border-b border-rule px-5 py-4">
                <div>
                  <h2 className="text-panneau text-ink-900">Tarification</h2>
                  <p className="mt-0.5 text-meta text-steel-500">Montants en francs guinéens (GNF), hors taxes</p>
                </div>
                {marge !== null && <Badge variant={marge >= 0 ? 'ok' : 'rupture'}>Marge {marge}%</Badge>}
              </div>
              <div className="flex flex-col gap-4 p-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Input
                    label="Prix d’achat"
                    type="number"
                    min={0}
                    error={formState.errors.prixAchat?.message}
                    {...register('prixAchat', { valueAsNumber: true })}
                  />
                  <Input
                    label="Prix de vente (détail)"
                    type="number"
                    min={0}
                    error={formState.errors.prixVente?.message}
                    {...register('prixVente', { valueAsNumber: true })}
                  />
                  <Input
                    label="TVA applicable (%)"
                    type="number"
                    min={0}
                    max={100}
                    error={formState.errors.tauxTva?.message}
                    {...register('tauxTva', { valueAsNumber: true })}
                  />
                </div>
                {prixTtc !== null && (
                  <div className="flex items-center justify-between rounded-md bg-paper px-4 py-3">
                    <span className="text-corps text-steel-500">Prix de vente TTC affiché en caisse</span>
                    <span className="text-lg font-semibold text-ink-900">
                      {FORMATEUR_GNF.format(prixTtc)} GNF
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-3 border-t border-rule pt-4">
                  <div>
                    <p className="text-corps font-medium text-ink-900">Prix par catégorie de client</p>
                    <p className="text-meta text-steel-500">Facultatifs : laissés vides, le prix de détail s’applique.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input
                      label="Prix demi-gros"
                      type="number"
                      min={0}
                      placeholder={prixDetailIndicatif}
                      error={formState.errors.prixDemiGros?.message}
                      {...register('prixDemiGros', { valueAsNumber: true })}
                    />
                    <Input
                      label="Prix gros"
                      type="number"
                      min={0}
                      placeholder={prixDetailIndicatif}
                      error={formState.errors.prixGros?.message}
                      {...register('prixGros', { valueAsNumber: true })}
                    />
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <div className="border-b border-rule px-5 py-4">
                <h2 className="text-panneau text-ink-900">Stock et seuil d’alerte</h2>
                <p className="mt-0.5 text-meta text-steel-500">Une alerte est créée automatiquement sous le seuil</p>
              </div>
              <div className="p-5">
                <Input
                  label="Seuil d’alerte"
                  type="number"
                  min={0}
                  hint="0 signifie qu’une alerte ne sera déclenchée qu’en cas de rupture."
                  error={formState.errors.seuilAlerte?.message}
                  {...register('seuilAlerte', { valueAsNumber: true })}
                />
              </div>
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
                <div className="min-w-0">
                  <h2 className="text-panneau text-ink-900">Suivi par lot et date de péremption</h2>
                  <p className="mt-0.5 text-meta text-steel-500">
                    Chaque réception devient un lot daté ; les ventes sortent d’abord ce qui périme le plus tôt.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={suiviParLot}
                  aria-label="Suivi par lot et date de péremption"
                  onClick={() => setValue('suiviParLot', !suiviParLot, { shouldDirty: true })}
                  className={cn(
                    'inline-flex h-7 shrink-0 items-center gap-2 rounded-full border px-1 pr-3 text-meta font-medium transition-colors',
                    suiviParLot ? 'border-action bg-action-wash text-action' : 'border-rule-strong bg-paper text-steel-500',
                  )}
                >
                  <span
                    className={cn('size-5 rounded-full transition-colors', suiviParLot ? 'bg-action' : 'bg-steel-400')}
                    aria-hidden="true"
                  />
                  {suiviParLot ? 'Activé' : 'Désactivé'}
                </button>
              </div>
              <div className="flex flex-col gap-4 p-5">
                <p className="text-corps text-steel-500">
                  Le suivi par lot est facultatif. Un produit sans date de péremption — ciment, fer à béton, quincaillerie —
                  fonctionne exactement comme avant, sans lot ni date à saisir.
                </p>
                {suiviParLot && (
                  <>
                    {enEdition && produit.data && !produit.data.suiviParLot && (
                      <Alert variant="info">
                        Le stock déjà présent deviendra un lot « SANS-LOT », sans date de péremption : il sortira après
                        les lots datés.
                      </Alert>
                    )}
                    <Input
                      label="Alerte de péremption (jours)"
                      type="number"
                      min={1}
                      placeholder="Seuil de l’entreprise"
                      hint="Un lot est mis sous surveillance ce nombre de jours avant sa péremption. Vide : seuil de l’entreprise."
                      error={formState.errors.seuilAlertePeremption?.message}
                      {...register('seuilAlertePeremption', { valueAsNumber: true })}
                    />
                  </>
                )}
                {enEdition && produit.data?.suiviParLot && <LotsDuProduit produitId={id} />}
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <div className="border-b border-rule px-5 py-4">
                <h2 className="text-panneau text-ink-900">Photo du produit</h2>
              </div>
              <div className="p-5">
                <ImageUploadField label="" valeur={photoUrl} dossier="produits" onChange={setPhotoUrl} />
              </div>
            </Card>

            {enEdition && (
              <Card>
                <div className="border-b border-rule px-5 py-4">
                  <h2 className="text-panneau text-ink-900">Fournisseur habituel</h2>
                </div>
                <div className="p-5">
                  {fournisseurHabituel ? (
                    <Link
                      to={`/fournisseurs/${fournisseurHabituel.id}`}
                      className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-survol"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-action-wash text-meta font-semibold text-action">
                        {fournisseurHabituel.nom.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="truncate text-corps font-medium text-ink-900">{fournisseurHabituel.nom}</span>
                    </Link>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-4 text-center">
                      <Truck className="size-6 text-steel-500" aria-hidden="true" />
                      <p className="text-corps text-steel-500">Aucun fournisseur associé pour l’instant.</p>
                      <p className="text-meta text-steel-500">
                        Associez-le depuis la fiche du fournisseur, onglet « Produits associés ».
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            <Card>
              <div className="p-5">
                <div className="mb-1 flex items-baseline justify-between">
                  <h2 className="text-panneau text-ink-900">Complétude de la fiche</h2>
                  <span className="text-2xl font-bold text-action">{completude.pourcentage}%</span>
                </div>
                <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-paper">
                  <div
                    className="h-full rounded-full bg-action transition-all"
                    style={{ width: `${completude.pourcentage}%` }}
                  />
                </div>
                <ul className="flex flex-col gap-1.5">
                  {completude.criteres.map((c) => (
                    <li key={c.libelle} className="flex items-center gap-2 text-corps">
                      <span
                        className={`inline-flex size-1.5 shrink-0 rounded-full ${c.ok ? 'bg-ok' : 'bg-faible'}`}
                        aria-hidden="true"
                      />
                      <span className={c.ok ? 'text-ink-900' : 'text-steel-500'}>{c.libelle}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          </div>
        </div>
      </form>
      {creation && (
        <ModaleNom
          titre={creation.type === 'categorie' ? 'Nouvelle catégorie' : 'Nouvelle marque'}
          label="Nom"
          valeurInitiale={creation.terme}
          onFermer={() => setCreation(null)}
          onValider={async (nom) => {
            const chemin = creation.type === 'categorie' ? '/categories' : '/marques';
            const cree = (await api.post<ElementReference>(chemin, { nom })).data;
            await queryClient.invalidateQueries({ queryKey: [creation.type === 'categorie' ? 'categories' : 'marques'] });
            setValue(creation.type === 'categorie' ? 'categorieId' : 'marqueId', cree.id, { shouldDirty: true });
          }}
        />
      )}
    </>
  );
}
