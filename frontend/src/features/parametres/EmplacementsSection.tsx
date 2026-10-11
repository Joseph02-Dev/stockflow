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
import { SelecteurChamp } from '@/components/ui/SelecteurChamp';
import { useModules } from '@/lib/useModules';
import { STRATEGIES, type StrategieSortie } from '@/lib/strategieSortie';
import { Card } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';

interface Emplacement {
  id: string;
  nom: string;
  adresse: string | null;
  archive: boolean;
  parentId: string | null;
  strategieSortie: StrategieSortie | null;
  /** « Dépôt / Zone A / Allée 3 » (le nom seul sans arborescence). */
  chemin: string;
}

const schema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères.'),
  adresse: z.string().optional(),
  parentId: z.string().optional(),
  strategieSortie: z.string().optional(),
});

/** L'emplacement et tous ses sous-emplacements : jamais parents possibles de lui-même. */
function descendants(id: string, tous: Emplacement[]): Set<string> {
  const exclus = new Set([id]);
  let ajout = true;
  while (ajout) {
    ajout = false;
    for (const e of tous) {
      if (e.parentId && exclus.has(e.parentId) && !exclus.has(e.id)) {
        exclus.add(e.id);
        ajout = true;
      }
    }
  }
  return exclus;
}

const profondeur = (e: Emplacement) => e.chemin.split(' / ').length - 1;

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

  const modules = useModules();
  const { register, handleSubmit, reset, formState, control } = useForm<Formulaire>({
    resolver: zodResolver(schema),
  });

  function ouvrirCreation() {
    setEnEdition(null);
    setErreur(null);
    reset({ nom: '', adresse: '', parentId: '', strategieSortie: '' });
    setModaleOuverte(true);
  }

  function ouvrirEdition(emplacement: Emplacement) {
    setEnEdition(emplacement);
    setErreur(null);
    reset({
      nom: emplacement.nom,
      adresse: emplacement.adresse ?? '',
      parentId: emplacement.parentId ?? '',
      strategieSortie: emplacement.strategieSortie ?? '',
    });
    setModaleOuverte(true);
  }

  const enregistrer = useMutation({
    mutationFn: async (valeurs: Formulaire) => {
      // L'adresse est facultative : on n'envoie pas de chaîne vide, qui
      // serait stockée telle quelle au lieu de rester nulle.
      const corps = {
        nom: valeurs.nom,
        ...(valeurs.adresse ? { adresse: valeurs.adresse } : {}),
        // Arborescence : '' = premier niveau. Rien n'est envoyé sans le module.
        ...(modules.arborescence ? { parentId: valeurs.parentId || null } : {}),
        // '' = la stratégie de l'entreprise.
        ...(modules.strategiesSortie ? { strategieSortie: valeurs.strategieSortie || null } : {}),
      };
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 basis-56 text-corps text-steel-500">
          {modules.arborescence
            ? 'Dépôts, zones, allées et étagères où vous stockez.'
            : 'Dépôts, magasins et ateliers où vous stockez.'}
        </p>
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
          <ul className="divide-y divide-rule">
            {data.map((emplacement) => (
              <li key={emplacement.id} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
                <div className="min-w-0" style={{ paddingLeft: `${Math.min(profondeur(emplacement), 4) * 1.25}rem` }}>
                  <p className="truncate text-corps font-medium text-ink-900">{emplacement.nom}</p>
                  {emplacement.parentId && (
                    <p className="truncate text-meta text-steel-500">{emplacement.chemin}</p>
                  )}
                  {emplacement.adresse && (
                    <p className="truncate text-corps text-steel-500">{emplacement.adresse}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" taille="sm" onClick={() => ouvrirEdition(emplacement)}>
                    <Pencil className="size-4" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">Modifier</span>
                  </Button>
                  <Button variant="ghost" taille="sm" onClick={() => setAArchiver(emplacement)}>
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
        modifie={formState.isDirty}
        pied={
          <>
            <Button type="button" variant="secondary" onClick={() => setModaleOuverte(false)}>
              Annuler
            </Button>
            <Button type="submit" form="formulaire-emplacement" loading={enregistrer.isPending}>
              Enregistrer
            </Button>
          </>
        }
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
          {modules.arborescence && (
            <SelecteurChamp<Formulaire>
              name="parentId"
              control={control}
              label="Rangé dans (facultatif)"
              placeholder="Premier niveau"
              options={[
                { valeur: '', libelle: 'Premier niveau' },
                ...(data ?? [])
                  .filter((e) => !(enEdition ? descendants(enEdition.id, data ?? []) : new Set<string>()).has(e.id))
                  .map((e) => ({ valeur: e.id, libelle: e.chemin })),
              ]}
            />
          )}
          {modules.strategiesSortie && (
            <SelecteurChamp<Formulaire>
              name="strategieSortie"
              control={control}
              label="Ordre de sortie des lots"
              options={[
                {
                  valeur: '',
                  libelle: `Celui de l’entreprise (${modules.strategieSortie})`,
                },
                ...STRATEGIES.map((s) => ({ valeur: s.valeur, libelle: s.libelle, sousTitre: s.aide })),
              ]}
            />
          )}

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
        <p className="text-corps text-steel-500">Cette action reste réversible côté base de données.</p>
      </Modal>
    </div>
  );
}
