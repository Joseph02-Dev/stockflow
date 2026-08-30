import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { useSession } from '@/lib/useSession';
import { Badge } from '@/components/ui/Badge';

interface UtilisateurListe {
  id: string;
  email: string;
  nom: string;
  role: 'ADMIN' | 'GESTIONNAIRE';
}

const schema = z.object({
  email: z.string().min(1, 'L’email est requis.').email('Adresse email invalide.'),
  role: z.enum(['ADMIN', 'GESTIONNAIRE']),
});

type Formulaire = z.infer<typeof schema>;

export function UtilisateursSection() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['utilisateurs'],
    queryFn: async () => (await api.get<UtilisateurListe[]>('/users')).data,
  });

  const { register, handleSubmit, reset, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'GESTIONNAIRE' },
  });

  const inviter = useMutation({
    mutationFn: async (valeurs: Formulaire) => api.post('/users', valeurs),
    onSuccess: (_reponse, valeurs) => {
      setErreur(null);
      setSucces(`Une invitation a été envoyée à ${valeurs.email}.`);
      setModaleOuverte(false);
      reset({ email: '', role: 'GESTIONNAIRE' });
      // La personne n'apparaîtra dans la liste qu'après acceptation, mais
      // on rafraîchit au cas où elle aurait accepté entre-temps.
      queryClient.invalidateQueries({ queryKey: ['utilisateurs'] });
    },
    onError: (err) => setErreur(messageErreur(err, 'L’invitation a échoué.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setErreur(null);
            setSucces(null);
            setModaleOuverte(true);
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          Inviter un utilisateur
        </Button>
      </div>

      {succes && <Alert variant="success">{succes}</Alert>}
      {erreur && !modaleOuverte && <Alert variant="error">{erreur}</Alert>}

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : data && data.length > 0 ? (
          <ul className="divide-y divide-border-subtle">
            {data.map((utilisateur) => (
              <li key={utilisateur.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">
                    {utilisateur.nom}
                    {utilisateur.id === session?.utilisateur.id && (
                      <span className="ml-2 text-sm font-normal text-text-secondary">(vous)</span>
                    )}
                  </p>
                  <p className="truncate text-sm text-text-secondary">{utilisateur.email}</p>
                </div>
                <Badge variant={utilisateur.role === 'ADMIN' ? 'info' : 'neutral'}>
                  {utilisateur.role === 'ADMIN' ? 'Administrateur' : 'Gestionnaire'}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState titre="Aucun utilisateur" />
        )}
      </Card>

      <Modal
        ouvert={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        titre="Inviter un utilisateur"
        description="La personne recevra un email avec un lien pour créer son compte."
      >
        <form
          onSubmit={handleSubmit((valeurs) => inviter.mutate(valeurs))}
          className="flex flex-col gap-4"
          noValidate
        >
          {erreur && <Alert variant="error">{erreur}</Alert>}

          <Input
            label="Email"
            type="email"
            error={formState.errors.email?.message}
            {...register('email')}
          />
          <Select
            label="Rôle"
            options={[
              { valeur: 'GESTIONNAIRE', libelle: 'Gestionnaire de stock' },
              { valeur: 'ADMIN', libelle: 'Administrateur' },
            ]}
            error={formState.errors.role?.message}
            {...register('role')}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModaleOuverte(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={inviter.isPending}>
              Envoyer l’invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
