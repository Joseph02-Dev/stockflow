import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, Pencil, Phone, Plus, Search } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { Card, PageHeader, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { useDebounce } from '@/lib/useDebounce';
import { cn } from '@/lib/cn';
import { formatNombre, pluriel } from '@/lib/format';
import { FORMAT_TELEPHONE, LIBELLES_CATEGORIE } from './types';
import type { CategorieTarifaire, Client } from './types';

const CATEGORIES: CategorieTarifaire[] = ['DETAIL', 'DEMI_GROS', 'GROS'];

const schema = z.object({
  nom: z.string().trim().min(1, 'Le nom du client est requis.'),
  telephone: z
    .string()
    .trim()
    .refine((v) => v === '' || FORMAT_TELEPHONE.test(v), 'Format international attendu, ex. +224 622 45 18 03.'),
  nomCommerce: z.string().trim(),
  categorie: z.enum(['GROS', 'DEMI_GROS', 'DETAIL']),
  plafondCredit: z.union([z.number().int('Montant entier en GNF.').min(0, 'Montant positif attendu.'), z.nan()]),
});

type Formulaire = z.infer<typeof schema>;

const VIDE: Formulaire = { nom: '', telephone: '', nomCommerce: '', categorie: 'DETAIL', plafondCredit: Number.NaN };

export function ClientsPage() {
  const queryClient = useQueryClient();
  const [recherche, setRecherche] = useState('');
  const rechercheRetardee = useDebounce(recherche.trim(), 250);
  const [afficherArchives, setAfficherArchives] = useState(false);
  const [edition, setEdition] = useState<Client | 'nouveau' | null>(null);
  const [aArchiver, setAArchiver] = useState<Client | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['clients', { recherche: rechercheRetardee, afficherArchives }],
    queryFn: async () => {
      const parametres = new URLSearchParams();
      if (rechercheRetardee) parametres.set('search', rechercheRetardee);
      if (afficherArchives) parametres.set('archive', 'true');
      return (await api.get<Client[]>(`/clients?${parametres}`)).data;
    },
  });

  const { register, handleSubmit, reset, control, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
    defaultValues: VIDE,
  });
  const categorie = useWatch({ control, name: 'categorie' });

  function ouvrir(client: Client | 'nouveau') {
    setErreur(null);
    reset(
      client === 'nouveau'
        ? VIDE
        : {
            nom: client.nom,
            telephone: client.telephone ?? '',
            nomCommerce: client.nomCommerce ?? '',
            categorie: client.categorie,
            plafondCredit: client.plafondCredit ?? Number.NaN,
          },
    );
    setEdition(client);
  }

  const enregistrer = useMutation({
    mutationFn: async (valeurs: Formulaire) => {
      const plafond = Number.isNaN(valeurs.plafondCredit) ? null : valeurs.plafondCredit;
      if (edition === 'nouveau') {
        return api.post('/clients', {
          nom: valeurs.nom,
          categorie: valeurs.categorie,
          ...(valeurs.telephone ? { telephone: valeurs.telephone } : {}),
          ...(valeurs.nomCommerce ? { nomCommerce: valeurs.nomCommerce } : {}),
          ...(plafond !== null ? { plafondCredit: plafond } : {}),
        });
      }
      // En modification, un champ vidé est explicitement effacé (null).
      return api.patch(`/clients/${(edition as Client).id}`, {
        nom: valeurs.nom,
        categorie: valeurs.categorie,
        telephone: valeurs.telephone || null,
        nomCommerce: valeurs.nomCommerce || null,
        plafondCredit: plafond,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setEdition(null);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’enregistrement a échoué.')),
  });

  const archiver = useMutation({
    mutationFn: async (id: string) => api.patch(`/clients/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setAArchiver(null);
    },
    onError: (err) => {
      setAArchiver(null);
      setErreur(messageErreur(err, 'L’archivage a échoué.'));
    },
  });

  const clients = data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Clients"
        description="À qui vous vendez, à quel tarif, et jusqu’où vous leur faites crédit."
        action={
          <Button onClick={() => ouvrir('nouveau')}>
            <Plus className="size-4" aria-hidden="true" />
            Nouveau client
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Rechercher un client</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, commerce ou téléphone…"
            className="h-9 w-full rounded-md border border-rule-strong bg-surface pr-3 pl-9 text-corps text-ink-900 placeholder:text-steel-400 hover:border-steel-400 focus:border-action"
          />
        </label>
        <label className="flex shrink-0 items-center gap-2 text-corps text-steel-700">
          <input
            type="checkbox"
            checked={afficherArchives}
            onChange={(e) => setAfficherArchives(e.target.checked)}
            className="size-4 accent-action"
          />
          Afficher les clients archivés
        </label>
      </div>

      {erreur && !edition && <Alert variant="error">{erreur}</Alert>}

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : clients.length === 0 ? (
          <EmptyState
            titre={rechercheRetardee ? 'Aucun client trouvé' : 'Aucun client'}
            description={
              rechercheRetardee
                ? 'Essayez un autre nom, commerce ou numéro.'
                : 'Ajoutez vos clients pour leur vendre au bon tarif et suivre leur crédit.'
            }
            action={!rechercheRetardee && <Button onClick={() => ouvrir('nouveau')}>Créer un client</Button>}
          />
        ) : (
          <>
            <PanneauEntete titre={`${clients.length} ${pluriel('client', clients.length)}`} />
            <ul className="divide-y divide-rule">
              {clients.map((client) => (
                <li key={client.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Vignette nom={client.nom} taille={36} className="rounded-full" />
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-corps font-medium text-ink-900">{client.nom}</span>
                      {client.archive && <Badge variant="neutral">Archivé</Badge>}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-3 text-meta text-steel-500">
                      {client.nomCommerce && <span className="truncate">{client.nomCommerce}</span>}
                      {client.telephone ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <Phone className="size-3 text-steel-400" aria-hidden="true" />
                          {client.telephone}
                        </span>
                      ) : (
                        <span className="text-steel-400">Pas de téléphone</span>
                      )}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-meta text-steel-500">Plafond de crédit</p>
                    <p className="text-corps text-ink-900">
                      {client.plafondCredit === null ? '—' : `${formatNombre(client.plafondCredit)} GNF`}
                    </p>
                  </div>
                  <Badge variant={client.categorie === 'GROS' ? 'action' : client.categorie === 'DEMI_GROS' ? 'accent' : 'neutral'}>
                    {LIBELLES_CATEGORIE[client.categorie]}
                  </Badge>
                  <div className="flex shrink-0 gap-0.5">
                    <Button variant="ghost" taille="sm" icone aria-label={`Modifier ${client.nom}`} title="Modifier" onClick={() => ouvrir(client)}>
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    {!client.archive && (
                      <Button variant="ghost" taille="sm" icone aria-label={`Archiver ${client.nom}`} title="Archiver" onClick={() => setAArchiver(client)}>
                        <Archive className="size-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Drawer
        ouvert={edition !== null}
        onFermer={() => setEdition(null)}
        titre={edition === 'nouveau' ? 'Nouveau client' : 'Modifier le client'}
        description="Seul le nom est obligatoire."
        modifie={formState.isDirty}
        pied={
          <>
            <Button type="button" variant="secondary" onClick={() => setEdition(null)}>
              Annuler
            </Button>
            <Button type="submit" form="formulaire-client" loading={enregistrer.isPending}>
              Enregistrer
            </Button>
          </>
        }
      >
        <form id="formulaire-client" onSubmit={handleSubmit((valeurs) => enregistrer.mutate(valeurs))} className="flex flex-col gap-4" noValidate>
          {erreur && <Alert variant="error">{erreur}</Alert>}

          <Input label="Nom" autoComplete="off" error={formState.errors.nom?.message} {...register('nom')} />
          <Input
            label="Téléphone (facultatif)"
            type="tel"
            inputMode="tel"
            placeholder="+224 622 45 18 03"
            error={formState.errors.telephone?.message}
            {...register('telephone')}
          />
          <Input label="Nom du commerce (facultatif)" error={formState.errors.nomCommerce?.message} {...register('nomCommerce')} />

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-corps font-medium text-ink-900">Catégorie tarifaire</legend>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((valeur) => (
                <label
                  key={valeur}
                  className={cn(
                    'flex h-9 cursor-pointer items-center justify-center rounded-md border text-corps font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-action',
                    categorie === valeur
                      ? 'border-action bg-action-wash text-action'
                      : 'border-rule-strong text-steel-700 hover:border-steel-400',
                  )}
                >
                  <input type="radio" value={valeur} className="sr-only" {...register('categorie')} />
                  {LIBELLES_CATEGORIE[valeur]}
                </label>
              ))}
            </div>
            <p className="text-meta text-steel-500">Détermine le prix appliqué à ses achats.</p>
          </fieldset>

          <Input
            label="Plafond de crédit en GNF (facultatif)"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            error={formState.errors.plafondCredit?.message}
            {...register('plafondCredit', { valueAsNumber: true })}
          />
          <p className="-mt-2 text-meta text-steel-500">Au-delà, la vente est signalée mais jamais bloquée.</p>
        </form>
      </Drawer>

      <Modal
        ouvert={aArchiver !== null}
        onFermer={() => setAArchiver(null)}
        titre="Archiver ce client ?"
        description={`« ${aArchiver?.nom} » n’apparaîtra plus dans les listes ni dans les nouvelles ventes. Son historique est conservé.`}
        pied={
          <>
            <Button variant="secondary" onClick={() => setAArchiver(null)}>
              Annuler
            </Button>
            <Button variant="danger" loading={archiver.isPending} onClick={() => aArchiver && archiver.mutate(aArchiver.id)}>
              Archiver
            </Button>
          </>
        }
      >
        <p className="text-corps text-steel-500">Vous pourrez le retrouver en cochant « Afficher les clients archivés ».</p>
      </Modal>
    </div>
  );
}
