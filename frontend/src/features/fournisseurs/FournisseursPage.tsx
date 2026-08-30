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
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';

interface Fournisseur {
  id: string;
  nom: string;
  emailContact: string | null;
  telephone: string | null;
}

const schema = z.object({
  nom: z.string().min(1, 'Le nom du fournisseur est requis.'),
  emailContact: z
    .string()
    .email('Adresse email invalide.')
    .optional()
    .or(z.literal('')),
  telephone: z.string().optional(),
});

type Formulaire = z.infer<typeof schema>;

export function FournisseursPage() {
  const queryClient = useQueryClient();
  const [drawerOuvert, setDrawerOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: async () => (await api.get<Fournisseur[]>('/fournisseurs')).data,
  });

  const { register, handleSubmit, reset, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
  });

  function ouvrirCreation() {
    setErreur(null);
    reset({ nom: '', emailContact: '', telephone: '' });
    setDrawerOuvert(true);
  }

  const creer = useMutation({
    mutationFn: async (valeurs: Formulaire) =>
      api.post('/fournisseurs', {
        nom: valeurs.nom,
        // Les champs facultatifs vides ne sont pas envoyés : ils doivent
        // rester nuls en base plutôt que d'être des chaînes vides.
        ...(valeurs.emailContact ? { emailContact: valeurs.emailContact } : {}),
        ...(valeurs.telephone ? { telephone: valeurs.telephone } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fournisseurs'] });
      setDrawerOuvert(false);
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

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : data && data.length > 0 ? (
          <ul className="divide-y divide-border-subtle">
            {data.map((fournisseur) => (
              <li key={fournisseur.id}>
                <Link
                  to={`/fournisseurs/${fournisseur.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-background"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text-primary">{fournisseur.nom}</p>
                    <p className="truncate text-sm text-text-secondary">
                      {[fournisseur.emailContact, fournisseur.telephone].filter(Boolean).join(' · ') ||
                        'Aucun contact renseigné'}
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            titre="Aucun fournisseur"
            description="Ajoutez un fournisseur pour suivre vos approvisionnements."
            action={<Button onClick={ouvrirCreation}>Créer un fournisseur</Button>}
          />
        )}
      </Card>

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
