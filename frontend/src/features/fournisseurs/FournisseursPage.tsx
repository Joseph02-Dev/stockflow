import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronRight, Clock, Phone, Plus, Search } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Drawer } from '@/components/ui/Drawer';
import { ImageUploadField } from '@/components/patterns/ImageUploadField';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { cn } from '@/lib/cn';
import { pluriel } from '@/lib/format';
import { Vignette } from '@/components/patterns/Vignette';
import { FournisseurDetail } from './FournisseurDetail';
import { teinteFournisseur, useActiviteFournisseurs, type ActiviteFournisseur } from './activite';

interface Fournisseur {
  id: string;
  nom: string;
  emailContact: string | null;
  telephone: string | null;
  photoUrl: string | null;
  delaiLivraisonJours: number | null;
}

const schema = z.object({
  nom: z.string().min(1, 'Le nom du fournisseur est requis.'),
  emailContact: z
    .string()
    .email('Adresse email invalide.')
    .optional()
    .or(z.literal('')),
  telephone: z.string().optional(),
  delaiLivraisonJours: z.union([z.number().int().min(0), z.nan()]).optional(),
});

type Formulaire = z.infer<typeof schema>;

function LigneResume({ fournisseur }: { fournisseur: Fournisseur }) {
  if (fournisseur.delaiLivraisonJours === null && !fournisseur.telephone) {
    return <span className="text-steel-400">Aucun contact renseigné</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-x-3">
      {fournisseur.delaiLivraisonJours !== null && (
        <span className="inline-flex shrink-0 items-center gap-1">
          <Clock className="size-3 text-steel-400" aria-hidden="true" />
          {fournisseur.delaiLivraisonJours} j
        </span>
      )}
      {fournisseur.telephone && (
        <span className="inline-flex min-w-0 items-center gap-1">
          <Phone className="size-3 shrink-0 text-steel-400" aria-hidden="true" />
          <span className="truncate">{fournisseur.telephone}</span>
        </span>
      )}
    </span>
  );
}

/** Ce qui demande de l'attention chez ce fournisseur : commandes en route, produits en alerte. */
function Marques({ activite }: { activite: ActiviteFournisseur }) {
  const alertes = activite.produitsEnAlerte.size;
  if (activite.enRoute === 0 && alertes === 0) return null;
  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {activite.enRoute > 0 && (
        <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-[#2f6fb3]/12 px-2 text-[11px] font-semibold text-[#2f6fb3] dark:text-[#6aa8d6]">
          <i className="size-[5px] rounded-full bg-current" aria-hidden="true" />
          {activite.enRoute} en route
        </span>
      )}
      {alertes > 0 && (
        <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-rupture-wash px-2 text-[11px] font-semibold text-rupture">
          <i className="size-[5px] rounded-full bg-current" aria-hidden="true" />
          {alertes} en alerte
        </span>
      )}
    </span>
  );
}

const sansAccents = (texte: string) =>
  texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function FournisseursPage() {
  const queryClient = useQueryClient();
  const [drawerOuvert, setDrawerOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [terme, setTerme] = useState('');
  const activite = useActiviteFournisseurs();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: async () => (await api.get<Fournisseur[]>('/fournisseurs')).data,
  });

  // Vue maître-détail desktop : retombe sur le premier fournisseur de la
  // liste si rien n'est sélectionné, ou si la sélection a disparu (ex.
  // fournisseur supprimé) — calculé pendant le rendu plutôt que via un
  // effet, pour éviter un rendu supplémentaire évitable.
  const selectionEffective =
    selectionId && data?.some((f) => f.id === selectionId) ? selectionId : (data?.[0]?.id ?? null);

  const cible = sansAccents(terme.trim());
  const visibles = (data ?? []).filter(
    (f) => !cible || sansAccents(`${f.nom} ${f.telephone ?? ''} ${f.emailContact ?? ''}`).includes(cible),
  );
  const recherche = (
    <label className="relative block border-b border-rule p-3">
      <Search className="absolute top-1/2 left-6 size-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
      <input
        type="search"
        value={terme}
        onChange={(e) => setTerme(e.target.value)}
        placeholder="Nom, téléphone ou email"
        aria-label="Rechercher un fournisseur"
        autoComplete="off"
        className="h-[38px] w-full rounded-md border border-rule-strong bg-surface pr-3 pl-9 text-corps text-ink-900 outline-none placeholder:text-steel-400 focus:border-action focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-action)_15%,transparent)]"
      />
    </label>
  );
  const aucun = <p className="px-4 py-6 text-corps text-steel-500">Aucun fournisseur ne correspond.</p>;

  const { register, handleSubmit, reset, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
  });

  function ouvrirCreation() {
    setErreur(null);
    setPhotoUrl(undefined);
    reset({ nom: '', emailContact: '', telephone: '' });
    setDrawerOuvert(true);
  }

  const creer = useMutation({
    mutationFn: async (valeurs: Formulaire) =>
      api.post('/fournisseurs', {
        nom: valeurs.nom,
        ...(valeurs.emailContact ? { emailContact: valeurs.emailContact } : {}),
        ...(valeurs.telephone ? { telephone: valeurs.telephone } : {}),
        ...(photoUrl ? { photoUrl } : {}),
        ...(valeurs.delaiLivraisonJours !== undefined && !Number.isNaN(valeurs.delaiLivraisonJours)
          ? { delaiLivraisonJours: valeurs.delaiLivraisonJours }
          : {}),
      }),
    onSuccess: (reponse) => {
      queryClient.invalidateQueries({ queryKey: ['fournisseurs'] });
      setDrawerOuvert(false);
      // Sélectionne directement le fournisseur qu'on vient de créer sur
      // desktop, plutôt que de laisser l'ancienne sélection en place.
      const nouveauId = (reponse.data as { id?: string } | undefined)?.id;
      if (nouveauId) setSelectionId(nouveauId);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’enregistrement a échoué.')),
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Fournisseurs"
        description="Qui vous livre quoi, en combien de temps, et comment les joindre."
        action={
          <Button onClick={ouvrirCreation}>
            <Plus className="size-4" aria-hidden="true" />
            Nouveau fournisseur
          </Button>
        }
      />

      {erreur && !drawerOuvert && <Alert variant="error">{erreur}</Alert>}

      {isLoading ? (
        <Card>
          <LoadingState />
        </Card>
      ) : isError ? (
        <Card>
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        </Card>
      ) : data && data.length > 0 ? (
        <>
          {/* Desktop : vue maître-détail, liste + fiche sur le même écran */}
          <div className="hidden items-start gap-5 md:flex">
            <Card className="w-72 shrink-0 lg:w-[330px]">
              {recherche}
              <p className="px-4 pt-2.5 pb-1 text-meta font-semibold tracking-[0.04em] text-steel-400 uppercase">
                {visibles.length} {pluriel('fournisseur', visibles.length)}
              </p>
              {visibles.length === 0 && aucun}
              <ul className="max-h-[calc(100vh-17rem)] overflow-y-auto">
                {visibles.map((fournisseur) => (
                  <li key={fournisseur.id}>
                    <button
                      type="button"
                      onClick={() => setSelectionId(fournisseur.id)}
                      aria-current={selectionEffective === fournisseur.id ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-3 border-l-[3px] py-3 pr-4 pl-[15px] text-left transition-colors',
                        selectionEffective === fournisseur.id
                          ? 'border-action bg-action-wash'
                          : 'border-transparent hover:bg-entete-tableau',
                      )}
                    >
                      <Vignette nom={fournisseur.nom} photoUrl={fournisseur.photoUrl} taille={42} teinte={teinteFournisseur(fournisseur.id)} className="rounded-full!" />
                      <div className="min-w-0">
                        <p className="truncate text-corps font-semibold text-ink-900">{fournisseur.nom}</p>
                        <p className="text-meta text-steel-400">
                          <LigneResume fournisseur={fournisseur} />
                        </p>
                        <Marques activite={activite(fournisseur.id)} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="min-w-0 flex-1">
              {selectionEffective ? (
                <FournisseurDetail fournisseurId={selectionEffective} />
              ) : (
                <Card>
                  <EmptyState titre="Sélectionnez un fournisseur" description="Choisissez un contact dans la liste." />
                </Card>
              )}
            </div>
          </div>

          {/* Mobile : liste seule, navigation vers la fiche en page dédiée */}
          <Card className="md:hidden">
            {recherche}
            {visibles.length === 0 && aucun}
            <ul className="divide-y divide-rule">
              {visibles.map((fournisseur) => (
                <li key={fournisseur.id}>
                  <Link
                    to={`/fournisseurs/${fournisseur.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-entete-tableau"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Vignette nom={fournisseur.nom} photoUrl={fournisseur.photoUrl} taille={42} teinte={teinteFournisseur(fournisseur.id)} className="rounded-full!" />
                      <div className="min-w-0">
                        <p className="truncate text-corps font-semibold text-ink-900">{fournisseur.nom}</p>
                        <p className="text-meta text-steel-400">
                          <LigneResume fournisseur={fournisseur} />
                        </p>
                        <Marques activite={activite(fournisseur.id)} />
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-steel-400" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState
            titre="Aucun fournisseur"
            description="Ajoutez un fournisseur pour suivre vos approvisionnements."
            action={<Button onClick={ouvrirCreation}>Créer un fournisseur</Button>}
          />
        </Card>
      )}

      <Drawer
        ouvert={drawerOuvert}
        onFermer={() => setDrawerOuvert(false)}
        titre="Nouveau fournisseur"
        description="Seul le nom est obligatoire."
        modifie={formState.isDirty || !!photoUrl}
        pied={
          <>
            <Button type="button" variant="secondary" onClick={() => setDrawerOuvert(false)}>
              Annuler
            </Button>
            <Button type="submit" form="formulaire-fournisseur" loading={creer.isPending}>
              Enregistrer
            </Button>
          </>
        }
      >
        <form
          id="formulaire-fournisseur"
          onSubmit={handleSubmit((valeurs) => creer.mutate(valeurs))}
          className="flex flex-col gap-4"
          noValidate
        >
          {erreur && <Alert variant="error">{erreur}</Alert>}

          <ImageUploadField label="Photo" valeur={photoUrl} dossier="fournisseurs" onChange={setPhotoUrl} forme="rond" />

          <Input label="Nom" error={formState.errors.nom?.message} {...register('nom')} />
          <Input
            label="Email de contact (facultatif)"
            type="email"
            error={formState.errors.emailContact?.message}
            {...register('emailContact')}
          />
          <Input
            label="Téléphone (facultatif)"
            error={formState.errors.telephone?.message}
            {...register('telephone')}
          />
          <Input
            label="Délai de livraison moyen, en jours (facultatif)"
            type="number"
            min={0}
            error={formState.errors.delaiLivraisonJours?.message}
            {...register('delaiLivraisonJours', { valueAsNumber: true })}
          />

        </form>
      </Drawer>
    </div>
  );
}
