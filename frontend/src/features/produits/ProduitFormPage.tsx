import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronRight, Truck } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { ImageUploadField } from '@/components/patterns/ImageUploadField';
import { Card } from '@/components/patterns/Page';
import { LoadingState, ErrorState } from '@/components/patterns/States';

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
  tauxTva: number | null;
  codeBarre: string | null;
  description: string | null;
  uniteMesure: string | null;
  categorie: ElementReference | null;
  marque: ElementReference | null;
  fournisseursAssocies: { fournisseur: ElementReference }[];
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
  tauxTva: z.union([z.number().int().min(0).max(100), z.nan()]).optional(),
  codeBarre: z.string().optional(),
  description: z.string().optional(),
  categorieId: z.string().optional(),
  marqueId: z.string().optional(),
  uniteMesure: z.string().optional(),
});

type Formulaire = z.infer<typeof schema>;

function nombreOuIndefini(valeur: number | undefined): number | undefined {
  return valeur === undefined || Number.isNaN(valeur) ? undefined : valeur;
}

const FORMATEUR_GNF = new Intl.NumberFormat('fr-FR');

export function ProduitFormPage() {
  const { id } = useParams<{ id?: string }>();
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

  const { register, handleSubmit, reset, watch, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
    defaultValues: { nom: '', seuilAlerte: 0 },
  });

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
      tauxTva: produit.data.tauxTva ?? undefined,
      codeBarre: produit.data.codeBarre ?? '',
      description: produit.data.description ?? '',
      categorieId: produit.data.categorie?.id ?? '',
      marqueId: produit.data.marque?.id ?? '',
      uniteMesure: produit.data.uniteMesure ?? '',
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
      };
      if (enEdition) {
        await api.patch(`/produits/${id}`, corps);
      } else {
        await api.post('/produits', corps);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produits'] });
      queryClient.invalidateQueries({ queryKey: ['produit', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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

  const optionsCategories = [
    { valeur: '', libelle: 'Aucune' },
    ...(categories.data ?? []).map((c) => ({ valeur: c.id, libelle: c.nom })),
  ];
  const optionsMarques = [
    { valeur: '', libelle: 'Aucune' },
    ...(marques.data ?? []).map((m) => ({ valeur: m.id, libelle: m.nom })),
  ];

  if (enEdition && produit.isLoading) return <LoadingState />;
  if (enEdition && produit.isError) {
    return (
      <ErrorState message={messageErreur(produit.error, 'Produit introuvable.')} onRetry={() => produit.refetch()} />
    );
  }

  const fournisseurHabituel = produit.data?.fournisseursAssocies[0]?.fournisseur;

  return (
    <form onSubmit={handleSubmit((v) => enregistrer.mutate(v))} noValidate>
      <div className="sticky top-0 z-10 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <nav aria-label="Fil d’Ariane" className="flex min-w-0 items-center gap-1 text-sm text-text-secondary">
          <Link to="/produits" className="hover:text-text-primary hover:underline">
            Produits
          </Link>
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate text-text-primary">
            {enEdition ? (produit.data?.nom ?? '…') : 'Nouveau produit'}
          </span>
        </nav>

        <div className="flex items-center gap-3">
          {dernierEnregistrementLocal && (
            <span className="hidden text-xs text-text-secondary sm:inline">
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
            <div className="border-b border-border-subtle px-5 py-4">
              <h2 className="font-semibold text-text-primary">Informations générales</h2>
              <p className="text-sm text-text-secondary">Ce que verront vos gestionnaires dans le catalogue</p>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <Input label="Nom du produit" error={formState.errors.nom?.message} {...register('nom')} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select label="Catégorie" options={optionsCategories} {...register('categorieId')} />
                <Select label="Marque" options={optionsMarques} {...register('marqueId')} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label="Code-barre (facultatif)"
                  placeholder="3401234567890"
                  error={formState.errors.codeBarre?.message}
                  {...register('codeBarre')}
                />
                <Select
                  label="Unité de mesure"
                  options={[
                    { valeur: '', libelle: 'Non précisée' },
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
                  {...register('uniteMesure')}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="description" className="text-sm font-medium text-text-primary">
                  Description (facultatif)
                </label>
                <textarea
                  id="description"
                  rows={3}
                  {...register('description')}
                  className="rounded-(--radius-button) border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary"
                />
              </div>
              <Input
                label="Référence interne (facultatif)"
                placeholder="VIS-440"
                error={formState.errors.reference?.message}
                {...register('reference')}
              />
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
              <div>
                <h2 className="font-semibold text-text-primary">Tarification</h2>
                <p className="text-sm text-text-secondary">Montants en francs guinéens (GNF), hors taxes</p>
              </div>
              {marge !== null && <Badge variant={marge >= 0 ? 'success' : 'error'}>Marge {marge}%</Badge>}
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
                  label="Prix de vente"
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
                <div className="flex items-center justify-between rounded-(--radius-button) bg-background px-4 py-3">
                  <span className="text-sm text-text-secondary">Prix de vente TTC affiché en caisse</span>
                  <span className="text-lg font-semibold text-text-primary">
                    {FORMATEUR_GNF.format(prixTtc)} GNF
                  </span>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="border-b border-border-subtle px-5 py-4">
              <h2 className="font-semibold text-text-primary">Stock et seuil d’alerte</h2>
              <p className="text-sm text-text-secondary">Une alerte est créée automatiquement sous le seuil</p>
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
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <div className="border-b border-border-subtle px-5 py-4">
              <h2 className="font-semibold text-text-primary">Photo du produit</h2>
            </div>
            <div className="p-5">
              <ImageUploadField label="" valeur={photoUrl} dossier="produits" onChange={setPhotoUrl} />
            </div>
          </Card>

          {enEdition && (
            <Card>
              <div className="border-b border-border-subtle px-5 py-4">
                <h2 className="font-semibold text-text-primary">Fournisseur habituel</h2>
              </div>
              <div className="p-5">
                {fournisseurHabituel ? (
                  <Link
                    to={`/fournisseurs/${fournisseurHabituel.id}`}
                    className="flex items-center gap-3 rounded-(--radius-button) p-2 transition-colors hover:bg-background"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {fournisseurHabituel.nom.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="truncate text-sm font-medium text-text-primary">{fournisseurHabituel.nom}</span>
                  </Link>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <Truck className="size-6 text-text-secondary" aria-hidden="true" />
                    <p className="text-sm text-text-secondary">Aucun fournisseur associé pour l’instant.</p>
                    <p className="text-xs text-text-secondary">
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
                <h2 className="font-semibold text-text-primary">Complétude de la fiche</h2>
                <span className="text-2xl font-bold text-primary">{completude.pourcentage}%</span>
              </div>
              <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${completude.pourcentage}%` }}
                />
              </div>
              <ul className="flex flex-col gap-1.5">
                {completude.criteres.map((c) => (
                  <li key={c.libelle} className="flex items-center gap-2 text-sm">
                    <span
                      className={`inline-flex size-1.5 shrink-0 rounded-full ${c.ok ? 'bg-success' : 'bg-warning'}`}
                      aria-hidden="true"
                    />
                    <span className={c.ok ? 'text-text-primary' : 'text-text-secondary'}>{c.libelle}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </form>
  );
}
