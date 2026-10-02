import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronRight, Clock, Phone, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Drawer } from '@/components/ui/Drawer';
import { ImageUploadField } from '@/components/patterns/ImageUploadField';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { cn } from '@/lib/cn';
import { pluriel } from '@/lib/format';
import { Vignette } from '@/components/patterns/Vignette';
import { FournisseurDetail } from './FournisseurDetail';

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
          {fournisseur.delaiLivraisonJours} {pluriel('jour', fournisseur.delaiLivraisonJours)}
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

export function FournisseursPage() {
  const queryClient = useQueryClient();
  const [drawerOuvert, setDrawerOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [selectionId, setSelectionId] = useState<string | null>(null);

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
            <Card className="w-72 shrink-0 lg:w-80">
              <PanneauEntete titre={`${data.length} ${pluriel('fournisseur', data.length)}`} />
              <ul className="max-h-[calc(100vh-15rem)] divide-y divide-rule overflow-y-auto">
                {data.map((fournisseur) => (
                  <li key={fournisseur.id}>
                    <button
                      type="button"
                      onClick={() => setSelectionId(fournisseur.id)}
                      aria-current={selectionEffective === fournisseur.id ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-3 border-l-2 py-3 pr-4 pl-[18px] text-left transition-colors',
                        selectionEffective === fournisseur.id
                          ? 'border-action bg-action-wash'
                          : 'border-transparent hover:bg-entete-tableau',
                      )}
                    >
                      <Vignette nom={fournisseur.nom} photoUrl={fournisseur.photoUrl} taille={34} />
                      <div className="min-w-0">
                        <p className="truncate text-corps font-medium text-ink-900">{fournisseur.nom}</p>
                        <p className="text-meta text-steel-500">
                          <LigneResume fournisseur={fournisseur} />
                        </p>
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
            <ul className="divide-y divide-rule">
              {data.map((fournisseur) => (
                <li key={fournisseur.id}>
                  <Link
                    to={`/fournisseurs/${fournisseur.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-entete-tableau"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Vignette nom={fournisseur.nom} photoUrl={fournisseur.photoUrl} taille={36} />
                      <div className="min-w-0">
                        <p className="truncate text-corps font-medium text-ink-900">{fournisseur.nom}</p>
                        <p className="text-meta text-steel-500">
                          <LigneResume fournisseur={fournisseur} />
                        </p>
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
      >
        <form
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

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDrawerOuvert(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={creer.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
