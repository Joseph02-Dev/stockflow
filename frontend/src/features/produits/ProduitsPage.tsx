import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, Pencil, Plus, Search } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { useDebounce } from '@/lib/useDebounce';

interface Produit {
  id: string;
  nom: string;
  reference: string | null;
  seuilAlerte: number;
  archive: boolean;
}

const schema = z.object({
  nom: z.string().min(1, 'Le nom du produit est requis.'),
  reference: z.string().optional(),
  // La conversion en nombre est faite par React Hook Form
  // (valueAsNumber) : un input HTML renvoie toujours une chaîne.
  seuilAlerte: z
    .number({ message: 'Le seuil doit être un nombre.' })
    .int('Le seuil doit être un nombre entier.')
    .min(0, 'Le seuil ne peut pas être négatif.'),
});

type Formulaire = z.infer<typeof schema>;

export function ProduitsPage() {
  const queryClient = useQueryClient();
  const [recherche, setRecherche] = useState('');
  const [afficherArchives, setAfficherArchives] = useState(false);
  const [drawerOuvert, setDrawerOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState<Produit | null>(null);
  const [aArchiver, setAArchiver] = useState<Produit | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const rechercheRetardee = useDebounce(recherche);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['produits', rechercheRetardee, afficherArchives],
    queryFn: async () => {
      const parametres = new URLSearchParams();
      if (rechercheRetardee) parametres.set('search', rechercheRetardee);
      if (afficherArchives) parametres.set('archive', 'true');
      return (await api.get<Produit[]>(`/produits?${parametres.toString()}`)).data;
    },
  });

  const { register, handleSubmit, reset, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
  });

  function ouvrirCreation() {
    setEnEdition(null);
    setErreur(null);
    reset({ nom: '', reference: '', seuilAlerte: 0 });
    setDrawerOuvert(true);
  }

  function ouvrirEdition(produit: Produit) {
    setEnEdition(produit);
    setErreur(null);
    reset({ nom: produit.nom, reference: produit.reference ?? '', seuilAlerte: produit.seuilAlerte });
    setDrawerOuvert(true);
  }

  const enregistrer = useMutation({
    mutationFn: async (valeurs: Formulaire) => {
      const corps = {
        nom: valeurs.nom,
        seuilAlerte: valeurs.seuilAlerte,
        ...(valeurs.reference ? { reference: valeurs.reference } : {}),
      };
      if (enEdition) {
        await api.patch(`/produits/${enEdition.id}`, corps);
      } else {
        await api.post('/produits', corps);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produits'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDrawerOuvert(false);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’enregistrement a échoué.')),
  });

  const archiver = useMutation({
    mutationFn: async (id: string) => api.patch(`/produits/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['produits'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setAArchiver(null);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’archivage a échoué.')),
  });

  const rechercheActive = rechercheRetardee.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titre="Produits"
        description="Votre catalogue et les seuils d’alerte associés."
        action={
          <Button onClick={ouvrirCreation}>
            <Plus className="size-4" aria-hidden="true" />
            Nouveau produit
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary"
            aria-hidden="true"
          />
          <input
            type="search"
            value={recherche}
            onChange={(event) => setRecherche(event.target.value)}
            placeholder="Rechercher un produit…"
            aria-label="Rechercher un produit"
            className="w-full rounded-(--radius-button) border border-border-subtle bg-surface py-2 pr-3 pl-9 text-sm text-text-primary placeholder:text-text-secondary"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={afficherArchives}
            onChange={(event) => setAfficherArchives(event.target.checked)}
          />
          Afficher les produits archivés
        </label>
      </div>

      {erreur && !drawerOuvert && <Alert variant="error">{erreur}</Alert>}

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : data && data.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="border-b border-border-subtle bg-background text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Nom</th>
                <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Référence</th>
                <th scope="col" className="px-4 py-3 font-medium text-text-secondary">Seuil d’alerte</th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {data.map((produit) => (
                <tr key={produit.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-text-primary">{produit.nom}</span>
                    {produit.archive && (
                      <span className="ml-2">
                        <Badge variant="neutral">Archivé</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{produit.reference ?? '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{produit.seuilAlerte}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => ouvrirEdition(produit)}>
                        <Pencil className="size-4" aria-hidden="true" />
                        <span className="sr-only lg:not-sr-only">Modifier</span>
                      </Button>
                      {/* Un produit déjà archivé n'a pas à l'être de nouveau. */}
                      {!produit.archive && (
                        <Button variant="ghost" onClick={() => setAArchiver(produit)}>
                          <Archive className="size-4" aria-hidden="true" />
                          <span className="sr-only lg:not-sr-only">Archiver</span>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : rechercheActive ? (
          // État distinct de l'état vide global : une recherche sans
          // résultat n'appelle pas la même action.
          <EmptyState
            titre="Aucun résultat"
            description={`Aucun produit ne correspond à « ${rechercheRetardee} ».`}
            action={
              <Button variant="secondary" onClick={() => setRecherche('')}>
                Effacer la recherche
              </Button>
            }
          />
        ) : (
          <EmptyState
            titre="Aucun produit"
            description="Créez votre premier produit pour commencer à suivre son stock."
            action={<Button onClick={ouvrirCreation}>Créer un produit</Button>}
          />
        )}
      </Card>

      <Drawer
        ouvert={drawerOuvert}
        onFermer={() => setDrawerOuvert(false)}
        titre={enEdition ? 'Modifier le produit' : 'Nouveau produit'}
        description="Le seuil déclenche une alerte lorsque le stock passe en dessous."
      >
        <form
          onSubmit={handleSubmit((valeurs) => enregistrer.mutate(valeurs))}
          className="flex flex-col gap-4"
          noValidate
        >
          {erreur && <Alert variant="error">{erreur}</Alert>}

          <Input label="Nom" error={formState.errors.nom?.message} {...register('nom')} />
          <Input
            label="Référence (facultatif)"
            placeholder="VIS-440"
            error={formState.errors.reference?.message}
            {...register('reference')}
          />
          <Input
            label="Seuil d’alerte"
            type="number"
            min={0}
            hint="0 signifie qu’une alerte ne sera déclenchée qu’en cas de rupture."
            error={formState.errors.seuilAlerte?.message}
            {...register('seuilAlerte', { valueAsNumber: true })}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDrawerOuvert(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={enregistrer.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Drawer>

      <Modal
        ouvert={aArchiver !== null}
        onFermer={() => setAArchiver(null)}
        titre="Archiver ce produit ?"
        description={`« ${aArchiver?.nom} » n’apparaîtra plus dans les listes et ne pourra plus faire l’objet de mouvements. Son historique est conservé.`}
        pied={
          <>
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
        <p className="text-sm text-text-secondary">
          Vous pourrez le retrouver en cochant « Afficher les produits archivés ».
        </p>
      </Modal>
    </div>
  );
}
