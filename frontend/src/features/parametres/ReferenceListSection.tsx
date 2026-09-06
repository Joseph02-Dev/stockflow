import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';

interface ElementReference {
  id: string;
  nom: string;
}

const schema = z.object({
  nom: z.string().min(1, 'Le nom est requis.').max(80),
});

type Formulaire = z.infer<typeof schema>;

interface ReferenceListSectionProps {
  /** Segment d'URL de l'API, ex. "categories" ou "marques". */
  endpoint: string;
  libelleSingulier: string;
  libellePluriel: string;
}

/**
 * Gestion générique d'une liste de référence simple (nom, rien d'autre) :
 * créer, renommer, supprimer avec confirmation. Catégories et marques
 * partagent exactement cette structure — un seul composant pour les deux.
 */
export function ReferenceListSection({ endpoint, libelleSingulier, libellePluriel }: ReferenceListSectionProps) {
  const queryClient = useQueryClient();
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [enEdition, setEnEdition] = useState<ElementReference | null>(null);
  const [aSupprimer, setASupprimer] = useState<ElementReference | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [endpoint],
    queryFn: async () => (await api.get<ElementReference[]>(`/${endpoint}`)).data,
  });

  const { register, handleSubmit, reset, formState } = useForm<Formulaire>({ resolver: zodResolver(schema) });

  function ouvrirCreation() {
    setEnEdition(null);
    setErreur(null);
    reset({ nom: '' });
    setModaleOuverte(true);
  }

  function ouvrirEdition(element: ElementReference) {
    setEnEdition(element);
    setErreur(null);
    reset({ nom: element.nom });
    setModaleOuverte(true);
  }

  const invaliderEtRafraichirProduits = () => {
    queryClient.invalidateQueries({ queryKey: [endpoint] });
    // Un renommage ou une suppression peut affecter l'affichage du
    // catalogue (nom de catégorie/marque montré sur chaque produit).
    queryClient.invalidateQueries({ queryKey: ['produits'] });
  };

  const enregistrer = useMutation({
    mutationFn: async (valeurs: Formulaire) => {
      if (enEdition) {
        await api.patch(`/${endpoint}/${enEdition.id}`, valeurs);
      } else {
        await api.post(`/${endpoint}`, valeurs);
      }
    },
    onSuccess: () => {
      invaliderEtRafraichirProduits();
      setModaleOuverte(false);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’enregistrement a échoué.')),
  });

  const supprimer = useMutation({
    mutationFn: async (id: string) => api.delete(`/${endpoint}/${id}`),
    onSuccess: () => {
      invaliderEtRafraichirProduits();
      setASupprimer(null);
    },
    onError: (err) => setErreur(messageErreur(err, 'La suppression a échoué.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={ouvrirCreation}>
          <Plus className="size-4" aria-hidden="true" />
          Nouvelle {libelleSingulier}
        </Button>
      </div>

      {erreur && !modaleOuverte && aSupprimer === null && <Alert variant="error">{erreur}</Alert>}

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : data && data.length > 0 ? (
          <ul className="divide-y divide-border-subtle">
            {data.map((element) => (
              <li key={element.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="truncate font-medium text-text-primary">{element.nom}</span>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" onClick={() => ouvrirEdition(element)}>
                    <Pencil className="size-4" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">Modifier</span>
                  </Button>
                  <Button variant="ghost" onClick={() => setASupprimer(element)}>
                    <Trash2 className="size-4" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">Supprimer</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            titre={`Aucune ${libelleSingulier}`}
            description={`Créez votre première ${libelleSingulier} pour classer vos produits.`}
            action={<Button onClick={ouvrirCreation}>Créer une {libelleSingulier}</Button>}
          />
        )}
      </Card>

      <Modal
        ouvert={modaleOuverte}
        onFermer={() => setModaleOuverte(false)}
        titre={enEdition ? `Modifier la ${libelleSingulier}` : `Nouvelle ${libelleSingulier}`}
      >
        <form
          onSubmit={handleSubmit((valeurs) => enregistrer.mutate(valeurs))}
          className="flex flex-col gap-4"
          noValidate
        >
          {erreur && <Alert variant="error">{erreur}</Alert>}
          <Input label="Nom" error={formState.errors.nom?.message} {...register('nom')} />
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
        ouvert={aSupprimer !== null}
        onFermer={() => setASupprimer(null)}
        titre={`Supprimer cette ${libelleSingulier} ?`}
        description={`« ${aSupprimer?.nom} » sera définitivement supprimée. Impossible si elle est utilisée par un produit.`}
        pied={
          <>
            <Button variant="secondary" onClick={() => setASupprimer(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              loading={supprimer.isPending}
              onClick={() => aSupprimer && supprimer.mutate(aSupprimer.id)}
            >
              Supprimer
            </Button>
          </>
        }
      >
        {erreur && aSupprimer !== null && <Alert variant="error">{erreur}</Alert>}
        <p className="text-sm text-text-secondary">
          Cette action est irréversible pour cette liste de {libellePluriel}.
        </p>
      </Modal>
    </div>
  );
}
