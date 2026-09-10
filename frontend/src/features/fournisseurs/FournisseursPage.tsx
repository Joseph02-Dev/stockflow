import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronRight, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Drawer } from '@/components/ui/Drawer';
import { ImageUploadField } from '@/components/patterns/ImageUploadField';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { cn } from '@/lib/cn';
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

function ligneResume(fournisseur: Fournisseur): string {
  return (
    [
      fournisseur.emailContact,
      fournisseur.telephone,
      fournisseur.delaiLivraisonJours !== null ? `${fournisseur.delaiLivraisonJours} j` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Aucun contact renseigné'
  );
}

function AvatarFournisseur({ fournisseur }: { fournisseur: Fournisseur }) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-background">
      {fournisseur.photoUrl ? (
        <img src={fournisseur.photoUrl} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-xs text-text-secondary">{fournisseur.nom.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
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
    <div className="flex flex-col gap-6">
      <PageHeader
        titre="Fournisseurs"
        description="Vos contacts d’approvisionnement et les produits qu’ils fournissent."
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
          <div className="hidden gap-6 md:flex">
            <Card className="h-fit w-80 shrink-0 overflow-hidden">
              <div className="border-b border-border-subtle px-4 py-3">
                <p className="text-sm font-medium text-text-primary">{data.length} partenaire(s)</p>
              </div>
              <ul className="max-h-[calc(100vh-14rem)] divide-y divide-border-subtle overflow-y-auto">
                {data.map((fournisseur) => (
                  <li key={fournisseur.id}>
                    <button
                      type="button"
                      onClick={() => setSelectionId(fournisseur.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                        selectionEffective === fournisseur.id ? 'bg-primary/10' : 'hover:bg-background',
                      )}
                    >
                      <AvatarFournisseur fournisseur={fournisseur} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">{fournisseur.nom}</p>
                        <p className="truncate text-xs text-text-secondary">{ligneResume(fournisseur)}</p>
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
            <ul className="divide-y divide-border-subtle">
              {data.map((fournisseur) => (
                <li key={fournisseur.id}>
                  <Link
                    to={`/fournisseurs/${fournisseur.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-background"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <AvatarFournisseur fournisseur={fournisseur} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-primary">{fournisseur.nom}</p>
                        <p className="truncate text-sm text-text-secondary">{ligneResume(fournisseur)}</p>
                      </div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
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
