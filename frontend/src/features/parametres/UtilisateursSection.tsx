import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Selecteur } from '@/components/ui/Selecteur';
import { SelecteurChamp } from '@/components/ui/SelecteurChamp';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { useSession } from '@/lib/useSession';
import { getSession, setSession, sessionActuelleEstPersistante } from '@/lib/session';
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

  const { register, handleSubmit, reset, control, formState } = useForm<Formulaire>({
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

  const changerRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: 'ADMIN' | 'GESTIONNAIRE' }) =>
      api.patch(`/users/${id}/role`, { role }),
    onSuccess: (_reponse, variables) => {
      setErreur(null);
      queryClient.invalidateQueries({ queryKey: ['utilisateurs'] });

      // Si l'Admin a modifié son propre rôle, la session locale doit
      // suivre — sinon l'interface continuerait d'afficher les options
      // réservées à l'Admin jusqu'à la prochaine connexion.
      const session = getSession();
      if (session && session.utilisateur.id === variables.id) {
        setSession(
          { ...session, utilisateur: { ...session.utilisateur, role: variables.role } },
          sessionActuelleEstPersistante(),
        );
      }
    },
    onError: (err) => setErreur(messageErreur(err, 'La modification du rôle a échoué.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 basis-56 text-corps text-steel-500">Les personnes qui peuvent saisir et consulter le stock.</p>
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
          <ul className="divide-y divide-rule">
            {data.map((utilisateur) => (
              <li key={utilisateur.id} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-corps font-medium text-ink-900">
                    {utilisateur.nom}
                    {utilisateur.id === session?.utilisateur.id && (
                      <span className="ml-2 text-corps font-normal text-steel-500">(vous)</span>
                    )}
                  </p>
                  <p className="truncate text-corps text-steel-500">{utilisateur.email}</p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant={utilisateur.role === 'ADMIN' ? 'action' : 'neutral'}>
                    {utilisateur.role === 'ADMIN' ? 'Administrateur' : 'Gestionnaire'}
                  </Badge>
                  <Selecteur
                    aria-label={`Rôle de ${utilisateur.nom}`}
                    taille="sm"
                    className="w-40"
                    options={[
                      { valeur: 'GESTIONNAIRE', libelle: 'Gestionnaire' },
                      { valeur: 'ADMIN', libelle: 'Administrateur' },
                    ]}
                    value={utilisateur.role}
                    disabled={changerRole.isPending}
                    onChange={(role) =>
                      // Comme le <select> d'avant : rien n'est envoyé si le rôle ne change pas.
                      role !== utilisateur.role &&
                      changerRole.mutate({ id: utilisateur.id, role: role as 'ADMIN' | 'GESTIONNAIRE' })
                    }
                  />
                </div>
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
        modifie={formState.isDirty}
        pied={
          <>
            <Button type="button" variant="secondary" onClick={() => setModaleOuverte(false)}>
              Annuler
            </Button>
            <Button type="submit" form="formulaire-invitation" loading={inviter.isPending}>
              Envoyer l’invitation
            </Button>
          </>
        }
      >
        <form
          id="formulaire-invitation"
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
          <SelecteurChamp
            name="role"
            control={control}
            label="Rôle"
            options={[
              { valeur: 'GESTIONNAIRE', libelle: 'Gestionnaire de stock' },
              { valeur: 'ADMIN', libelle: 'Administrateur' },
            ]}
          />
        </form>
      </Modal>
    </div>
  );
}
