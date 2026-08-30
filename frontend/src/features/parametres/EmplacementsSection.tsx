import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, Pencil, Plus } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';

interface Emplacement {
  id: string;
  nom: string;
  adresse: string | null;
  archive: boolean;
}

const schema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères.'),
  adresse: z.string().optional(),
});

type Formulaire = z.infer<typeof schema>;

export function EmplacementsSection() {
  const queryClient = useQueryClient();
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [enEdition, setEnEdition] = useState<Emplacement | null>(null);
  const [aArchiver, setAArchiver] = useState<Emplacement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => (await api.get<Emplacement[]>('/emplacements')).data,
  });

  const { register, handleSubmit, reset, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
  });

  function ouvrirCreation() {
    setEnEdition(null);
    setErreur(null);
    reset({ nom: '', adresse: '' });
    setModaleOuverte(true);
  }

  function ouvrirEdition(emplacement: Emplacement) {
    setEnEdition(emplacement);
    setErreur(null);
    reset({ nom: emplacement.nom, adresse: emplacement.adresse ?? '' });
    setModaleOuverte(true);
  }

  const enregistrer = useMutation({
    mutationFn: async (valeurs: Formulaire) => {
      // L'adresse est facultative : on n'envoie pas de chaîne vide, qui
      // serait stockée telle quelle au lieu de rester nulle.
      const corps = { nom: valeurs.nom, ...(valeurs.adresse ? { adresse: valeurs.adresse } : {}) };
      if (enEdition) {
        await api.patch(`/emplacements/${enEdition.id}`, corps);
      } else {
        await api.post('/emplacements', corps);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emplacements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setModaleOuverte(false);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’enregistrement a échoué.')),
  });

  const archiver = useMutation({
    mutationFn: async (id: string) => api.patch(`/emplacements/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emplacements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setAArchiver(null);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’archivage a échoué.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={ouvrirCreation}>
          <Plus className="size-4" aria-hidden="true" />
          Nouvel emplacement
        </Button>
      </div>

      {erreur && !modaleOuverte && <Alert variant="error">{erreur}</Alert>}

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : data && data.length > 0 ? (
          <ul className="divide-y divide-border-subtle">
            {data.map((emplacement) => (
              <li key={emplacement.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-text-primary">{emplacement.nom}</p>
                  {emplacement.adresse && (
                    <p className="truncate text-sm text-text-secondary">{emplacement.adresse}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" onClick={() => ouvrirEdition(emplacement)}>
                    <Pencil className="size-4" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">Modifier</span>
                  </Button>
                  <Button variant="ghost" onClick={() => setAArchiver(emplacement)}>
                    <Archive className="size-4" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">Archiver</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            titre="Aucun emplacement"
            description="Créez un emplacement pour commencer à y enregistrer du stock."
            action={<Button onClick={ouvrirCreation}>Créer un emplacement</Button>}
          />
        )}
      </Card>

      <Modal
        ouvert={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        titre={enEdition ? 'Modifier l’emplacement' : 'Nouvel emplacement'}
      >
        <form
          id="formulaire-emplacement"
          onSubmit={handleSubmit((valeurs) => enregistrer.mutate(valeurs))}
          className="flex flex-col gap-4"
          noValidate
        >
          {erreur && <Alert variant="error">{erreur}</Alert>}
          <Input label="Nom" error={formState.errors.nom?.message} {...register('nom')} />
          <Input label="Adresse (facultatif)" {...register('adresse')} />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModaleOuverte(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={enregistrer.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        ouvert={aArchiver !== null}
        onFermer={() => setAArchiver(null)}
        titre="Archiver cet emplacement ?"
        description={`« ${aArchiver?.nom} » n’apparaîtra plus dans les listes et ne pourra plus recevoir de mouvements. Son historique est conservé.`}
        pied={
          <>
            {/* Le focus par défaut reste sur Annuler : une action à
                conséquence ne doit jamais être déclenchée par mégarde. */}
            <Button variant="secondary" onClick={() => setAArchiver(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={archiver.isPending}
              onClick={() => aArchiver && archiver.mutate(aArchiver.id)}
            >
              Archiver
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">Cette action reste réversible côté base de données.</p>
      </Modal>
    </div>
  );
}
