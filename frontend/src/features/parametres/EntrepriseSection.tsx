import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/patterns/Page';
import { ErrorState, LoadingState } from '@/components/patterns/States';
import { getSession, setSession } from '@/lib/session';

const schema = z.object({
  nom: z.string().min(2, 'Le nom de l’entreprise doit contenir au moins 2 caractères.'),
});

type Formulaire = z.infer<typeof schema>;

export function EntrepriseSection() {
  const queryClient = useQueryClient();
  const [succes, setSucces] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['entreprise'],
    queryFn: async () => (await api.get<{ id: string; nom: string }>('/entreprise')).data,
  });

  const { register, handleSubmit, reset, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
  });

  // Le formulaire doit refléter la donnée serveur dès qu'elle est chargée.
  useEffect(() => {
    if (data) reset({ nom: data.nom });
  }, [data, reset]);

  const mutation = useMutation({
    mutationFn: async (valeurs: Formulaire) =>
      (await api.patch<{ id: string; nom: string }>('/entreprise', valeurs)).data,
    onSuccess: (entreprise) => {
      setErreur(null);
      setSucces(true);
      queryClient.invalidateQueries({ queryKey: ['entreprise'] });

      // Le nom de l'entreprise est affiché dans la barre supérieure depuis
      // la session : il faut la mettre à jour pour éviter d'afficher une
      // valeur périmée jusqu'à la prochaine connexion.
      const session = getSession();
      if (session) setSession({ ...session, entreprise });
    },
    onError: (err) => {
      setSucces(false);
      setErreur(messageErreur(err, 'La modification a échoué.'));
    },
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />;

  return (
    <Card>
      <form
        onSubmit={handleSubmit((valeurs) => mutation.mutate(valeurs))}
        className="flex max-w-md flex-col gap-4 p-5"
        noValidate
      >
        {succes && <Alert variant="success">Les informations ont été enregistrées.</Alert>}
        {erreur && <Alert variant="error">{erreur}</Alert>}

        <Input label="Nom de l’entreprise" error={formState.errors.nom?.message} {...register('nom')} />

        <div>
          <Button type="submit" loading={mutation.isPending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Card>
  );
}
