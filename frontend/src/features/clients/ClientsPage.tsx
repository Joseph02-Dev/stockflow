import { useState, useSyncExternalStore, type CSSProperties } from 'react';
import { Pagination } from '@/components/patterns/Pagination';
import { usePagination } from '@/components/patterns/usePagination';
import { Link } from 'react-router-dom';
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
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { BoutonWhatsApp } from '@/components/patterns/BoutonWhatsApp';
import { useDebounce } from '@/lib/useDebounce';
import { cn } from '@/lib/cn';
import { formatNombre, pluriel } from '@/lib/format';
import { gnf } from '@/lib/montant';
import { useCreances, type Debiteur } from '@/features/creances/types';
import { JaugeCredit } from './JaugeCredit';
import { FORMAT_TELEPHONE, LIBELLES_CATEGORIE } from './types';
import type { CategorieTarifaire, Client } from './types';
import { envoyerOuGarder, etatFile, nouvelIdClient, souscrireFile } from '@/lib/mouvementsHorsLigne';
import { useEnLigne } from '@/lib/useEnLigne';
import { appliquerClientsEnAttente } from './clientsEnAttente';
import './clients.css';

const CATEGORIES: CategorieTarifaire[] = ['DETAIL', 'DEMI_GROS', 'GROS'];
/** Ordre d'affichage des filtres : du plus gros volume au détail. */
const CATEGORIES_FILTRE: CategorieTarifaire[] = ['GROS', 'DEMI_GROS', 'DETAIL'];

/** Une teinte par catégorie tarifaire : avatar, pastille et filtre la partagent. */
const TEINTE_CATEGORIE: Record<CategorieTarifaire, string> = {
  GROS: 'var(--color-action)',
  DEMI_GROS: 'var(--color-accent)',
  DETAIL: 'var(--clients-detail)',
};

/** Filtre de la liste : une catégorie, ou une situation de crédit. */
type Filtre = CategorieTarifaire | 'DOIVENT' | 'DEPASSE' | null;

function depassePlafond(client: Pick<Client, 'plafondCredit'>, debiteur: Debiteur | undefined): boolean {
  return debiteur !== undefined && client.plafondCredit !== null && debiteur.solde > client.plafondCredit;
}

async function chargerClients(recherche: string, afficherArchives: boolean) {
  const parametres = new URLSearchParams();
  if (recherche) parametres.set('search', recherche);
  if (afficherArchives) parametres.set('archive', 'true');
  return (await api.get<Client[]>(`/clients?${parametres}`)).data;
}

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
  const [filtre, setFiltre] = useState<Filtre>(null);
  const [edition, setEdition] = useState<Client | 'nouveau' | null>(null);
  const [aArchiver, setAArchiver] = useState<Client | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const enLigne = useEnLigne();
  const file = useSyncExternalStore(souscrireFile, etatFile, etatFile);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['clients', { recherche: rechercheRetardee, afficherArchives }],
    queryFn: () => chargerClients(rechercheRetardee, afficherArchives),
  });
  // Les chiffres portent sur tous les clients actifs, quelle que soit la recherche
  // (même clé que la liste sans filtre : une seule requête dans le cas courant).
  const actifs = useQuery({
    queryKey: ['clients', { recherche: '', afficherArchives: false }],
    queryFn: () => chargerClients('', false),
  });
  const creances = useCreances();

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
    // Jamais en pause hors ligne : envoyerOuGarder garde le client sur l'appareil.
    networkMode: 'always',
    mutationFn: async (valeurs: Formulaire) => {
      const plafond = Number.isNaN(valeurs.plafondCredit) ? null : valeurs.plafondCredit;
      if (edition === 'nouveau') {
        // idClient : devient l'identifiant du client, même créé hors ligne.
        return envoyerOuGarder(
          'client',
          {
            idClient: nouvelIdClient(),
            nom: valeurs.nom,
            categorie: valeurs.categorie,
            ...(valeurs.telephone ? { telephone: valeurs.telephone } : {}),
            ...(valeurs.nomCommerce ? { nomCommerce: valeurs.nomCommerce } : {}),
            ...(plafond !== null ? { plafondCredit: plafond } : {}),
          },
          `Nouveau client · ${valeurs.nom}`,
          { enLigne },
        );
      }
      // En modification, un champ vidé est explicitement effacé (null).
      return envoyerOuGarder(
        'client',
        {
          nom: valeurs.nom,
          categorie: valeurs.categorie,
          telephone: valeurs.telephone || null,
          nomCommerce: valeurs.nomCommerce || null,
          plafondCredit: plafond,
        },
        `Modification · ${valeurs.nom}`,
        { enLigne, chemin: `/clients/${(edition as Client).id}`, methode: 'PATCH' },
      );
    },
    onSuccess: (resultat) => {
      setInfo(
        resultat.horsLigne
          ? 'Client enregistré sur cet appareil : il est déjà utilisable pour une vente, et sera envoyé au retour du réseau.'
          : null,
      );
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      // Le plafond de crédit est aussi lu par l'écran Créances.
      queryClient.invalidateQueries({ queryKey: ['creances'] });
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

  // Clients créés ou modifiés hors ligne, pas encore envoyés : visibles aussitôt.
  const { clients: avecAttente, enAttente } = appliquerClientsEnAttente(data ?? [], file.mouvements);
  const terme = rechercheRetardee.toLocaleLowerCase('fr');
  const clients = avecAttente.filter(
    (c) =>
      !enAttente.has(c.id) ||
      [c.nom, c.nomCommerce ?? '', c.telephone ?? ''].some((champ) => champ.toLocaleLowerCase('fr').includes(terme)),
  );
  const debiteurs = creances.data?.debiteurs ?? [];
  const debiteurParClient = new Map(debiteurs.map((d) => [d.client.id, d]));
  const resume = creances.data?.resume;
  const nombreDepasses = debiteurs.filter((d) => depassePlafond(d.client, d)).length;
  const parCategorie = (liste: Client[], categorie: CategorieTarifaire) => liste.filter((c) => c.categorie === categorie).length;
  const visibles = clients.filter((c) => {
    if (filtre === null) return true;
    if (filtre === 'DOIVENT') return debiteurParClient.has(c.id);
    if (filtre === 'DEPASSE') return depassePlafond(c, debiteurParClient.get(c.id));
    return c.categorie === filtre;
  });
  const { visibles: clientsPage, ancre, pagination } = usePagination(visibles, {
    reinitialiser: [filtre, rechercheRetardee, afficherArchives],
  });
  const basculer = (valeur: Exclude<Filtre, null>) => setFiltre((actuel) => (actuel === valeur ? null : valeur));

  return (
    <div className="clients-page flex flex-col gap-5">
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

      <div className="clients-chiffres">
        <div className="clients-chiffre" style={{ '--teinte': 'var(--color-ink-900)' } as CSSProperties}>
          <small>
            <i aria-hidden="true" />
            Clients actifs
          </small>
          <b>{actifs.data ? formatNombre(actifs.data.length) : '—'}</b>
          <span className="text-meta text-steel-400">
            {actifs.data &&
              CATEGORIES_FILTRE.filter((c) => parCategorie(actifs.data, c) > 0)
                .map((c) => `${parCategorie(actifs.data, c)} ${LIBELLES_CATEGORIE[c].toLowerCase()}`)
                .join(' · ')}
          </span>
        </div>
        <button
          type="button"
          className="clients-chiffre"
          aria-pressed={filtre === 'DOIVENT'}
          onClick={() => basculer('DOIVENT')}
          style={{ '--teinte': 'var(--color-faible)' } as CSSProperties}
        >
          <small>
            <i aria-hidden="true" />
            Doivent de l’argent
          </small>
          <b>{resume ? formatNombre(resume.nombreClients) : '—'}</b>
          <span className="text-meta text-steel-400">{resume && `${gnf(resume.totalDu)} au total`}</span>
        </button>
        <button
          type="button"
          className="clients-chiffre"
          aria-pressed={filtre === 'DEPASSE'}
          onClick={() => basculer('DEPASSE')}
          style={{ '--teinte': 'var(--color-rupture)' } as CSSProperties}
        >
          <small>
            <i aria-hidden="true" />
            Plafond dépassé
          </small>
          <b>{creances.data ? formatNombre(nombreDepasses) : '—'}</b>
          <span className="text-meta text-steel-400">Doivent plus que leur plafond de crédit</span>
        </button>
        <Link to="/creances" className="clients-chiffre" style={{ '--teinte': 'var(--color-action)' } as CSSProperties}>
          <small>
            <i aria-hidden="true" />
            En retard de paiement
          </small>
          <b>
            {resume ? formatNombre(resume.montantEnRetard) : '—'} <em>GNF</em>
          </b>
          <span className="text-meta font-semibold text-action">Voir les créances →</span>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative min-w-0 flex-[1_1_280px]">
          <span className="sr-only">Rechercher un client</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom, commerce ou téléphone…"
            className="h-10 w-full champ rounded-lg border border-rule-strong bg-surface-elevee pr-3 pl-9 text-corps text-ink-900 placeholder:text-steel-400 hover:border-steel-400 focus:border-action"
          />
        </label>
        <div className="clients-puces min-w-0" role="group" aria-label="Filtrer par catégorie">
          <button type="button" className="clients-puce" aria-pressed={filtre === null} onClick={() => setFiltre(null)}>
            Toutes <em>{clients.length}</em>
          </button>
          {CATEGORIES_FILTRE.map((c) => (
            <button
              key={c}
              type="button"
              className="clients-puce"
              aria-pressed={filtre === c}
              onClick={() => basculer(c)}
              style={{ '--c': TEINTE_CATEGORIE[c] } as CSSProperties}
            >
              <i aria-hidden="true" />
              {LIBELLES_CATEGORIE[c]} <em>{parCategorie(clients, c)}</em>
            </button>
          ))}
        </div>
        <label className="flex shrink-0 items-center gap-2 text-corps text-steel-700">
          <input
            type="checkbox"
            checked={afficherArchives}
            onChange={(e) => setAfficherArchives(e.target.checked)}
            className="size-4 accent-action"
          />
          Archivés
        </label>
      </div>

      {erreur && !edition && <Alert variant="error">{erreur}</Alert>}
      {info && <Alert variant="info">{info}</Alert>}

      {isLoading ? (
        <Card>
          <LoadingState />
        </Card>
      ) : isError ? (
        <Card>
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        </Card>
      ) : visibles.length === 0 ? (
        <Card>
          {clients.length > 0 ? (
            <EmptyState
              titre="Aucun client dans ce filtre"
              description="Aucun client ne correspond à ce filtre pour le moment."
              action={
                <Button variant="secondary" onClick={() => setFiltre(null)}>
                  Afficher tous les clients
                </Button>
              }
            />
          ) : (
            <EmptyState
              titre={rechercheRetardee ? 'Aucun client trouvé' : 'Aucun client'}
              description={
                rechercheRetardee
                  ? 'Essayez un autre nom, commerce ou numéro.'
                  : 'Ajoutez vos clients pour leur vendre au bon tarif et suivre leur crédit.'
              }
              action={!rechercheRetardee && <Button onClick={() => ouvrir('nouveau')}>Créer un client</Button>}
            />
          )}
        </Card>
      ) : (
        <div ref={ancre} className="flex scroll-mt-20 flex-col gap-3">
          <ul className="clients-grille" aria-label={`${visibles.length} ${pluriel('client', visibles.length)}`}>
            {clientsPage.map((client, i) => {
              const debiteur = debiteurParClient.get(client.id);
              const solde = debiteur?.solde ?? 0;
              return (
                <li key={client.id} className="clients-carte" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <div className="flex items-center gap-3">
                    <Vignette nom={client.nom} taille={44} teinte={TEINTE_CATEGORIE[client.categorie]} className="rounded-full! font-display text-[14px]!" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-[15px] font-semibold text-ink-900">{client.nom}</h2>
                      {client.nomCommerce && <p className="truncate text-meta text-steel-500">{client.nomCommerce}</p>}
                    </div>
                    {enAttente.has(client.id) ? (
                      <Badge variant="faible">En attente d’envoi</Badge>
                    ) : client.archive ? (
                      <Badge variant="neutral">Archivé</Badge>
                    ) : (
                      <span className="clients-categorie" style={{ '--c': TEINTE_CATEGORIE[client.categorie] } as CSSProperties}>
                        {LIBELLES_CATEGORIE[client.categorie]}
                      </span>
                    )}
                  </div>

                  {client.telephone ? (
                    <p className="inline-flex items-center gap-1.5 text-corps text-steel-700">
                      <Phone className="size-3.5 text-steel-400" aria-hidden="true" />
                      {client.telephone}
                    </p>
                  ) : (
                    <p className="text-corps text-steel-400">Pas de téléphone</p>
                  )}

                  {client.plafondCredit !== null ? (
                    <JaugeCredit solde={solde} plafond={client.plafondCredit} />
                  ) : solde > 0 ? (
                    <p className="text-meta text-steel-500">
                      Doit <b className="font-semibold text-ink-900">{gnf(solde)}</b> · sans plafond de crédit
                    </p>
                  ) : (
                    <p className="text-meta text-steel-400">Pas de plafond de crédit</p>
                  )}

                  <div className="clients-pied">
                    <BoutonWhatsApp compact libelle="WhatsApp" telephone={client.telephone} texte={`Bonjour ${client.nom},`} />
                    <span className="flex-1" />
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
              );
            })}
          </ul>
          <Pagination etat={pagination} className="px-0.5" />
        </div>
      )}

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
