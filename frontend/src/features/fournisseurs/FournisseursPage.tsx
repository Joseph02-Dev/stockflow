import { useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronRight, Clock, Phone, Plus, Search, Timer, TriangleAlert, Undo2 } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Drawer } from '@/components/ui/Drawer';
import { ImageUploadField } from '@/components/patterns/ImageUploadField';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { cn } from '@/lib/cn';
import { formatNombre, pluriel } from '@/lib/format';
import { joursEntre } from '@/lib/periode';
import { Vignette } from '@/components/patterns/Vignette';
import { FournisseurDetail } from './FournisseurDetail';
import { ponctualite, teinteFournisseur, useActiviteFournisseurs, type ActiviteFournisseur } from './activite';
import './fournisseurs.css';

interface Fournisseur {
  id: string;
  nom: string;
  emailContact: string | null;
  telephone: string | null;
  photoUrl: string | null;
  delaiLivraisonJours: number | null;
}

const schema = z.object({
  nom: z.string().min(1, 'Le nom du fournisseur est requis.'),
  emailContact: z
    .string()
    .email('Adresse email invalide.')
    .optional()
    .or(z.literal('')),
  telephone: z.string().optional(),
  delaiLivraisonJours: z.union([z.number().int().min(0), z.nan()]).optional(),
});

type Formulaire = z.infer<typeof schema>;

const formatJours = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** Délai annoncé et délai réel côte à côte ; le réel passe en ambre quand il dépasse l'annonce. */
function LigneResume({ fournisseur, activite }: { fournisseur: Fournisseur; activite: ActiviteFournisseur }) {
  const annonce = fournisseur.delaiLivraisonJours;
  const reel = activite.delaiReel;
  if (annonce === null && reel === null) {
    return fournisseur.telephone ? (
      <span className="inline-flex min-w-0 items-center gap-1">
        <Phone className="size-3 shrink-0 text-steel-400" aria-hidden="true" />
        <span className="truncate">{fournisseur.telephone}</span>
      </span>
    ) : (
      <span className="text-steel-400">Aucun délai ni contact renseigné</span>
    );
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2.5">
      <span className="inline-flex shrink-0 items-center gap-1">
        <Clock className="size-3 text-steel-400" aria-hidden="true" />
        {annonce === null ? 'délai non renseigné' : `${annonce} j annoncé${annonce > 1 ? 's' : ''}`}
      </span>
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 font-medium',
          reel === null ? 'font-normal' : annonce !== null && reel > annonce + 0.5 ? 'text-faible' : 'text-ok',
        )}
      >
        <Timer className="size-3" aria-hidden="true" />
        {reel === null ? 'aucune livraison' : `${formatJours(reel)} j réel${reel >= 2 ? 's' : ''}`}
      </span>
    </span>
  );
}

/** Ce qui demande de l'attention chez ce fournisseur : commandes en route, produits en alerte. */
function Marques({ activite }: { activite: ActiviteFournisseur }) {
  const alertes = activite.produitsEnAlerte.size;
  const avoirs = activite.avoirsEnAttente;
  if (activite.enRoute === 0 && alertes === 0 && avoirs.nombre === 0) return null;
  const marque = (couleur: string, texte: string) => (
    <span className="fournisseurs-marque" style={{ '--c': couleur } as CSSProperties}>
      <i aria-hidden="true" />
      {texte}
    </span>
  );
  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {activite.enRoute > 0 && marque('var(--color-action)', `${activite.enRoute} en route`)}
      {alertes > 0 && marque('var(--color-rupture)', `${alertes} en alerte`)}
      {avoirs.nombre > 0 &&
        marque('var(--color-faible)', avoirs.valeur > 0 ? `Avoir : ${formatNombre(avoirs.valeur)} GNF` : `${avoirs.nombre} ${pluriel('avoir', avoirs.nombre)} attendu${avoirs.nombre > 1 ? 's' : ''}`)}
    </span>
  );
}

type Filtre = 'tous' | 'route' | 'alerte' | 'avoirs';
const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'route', libelle: 'En route' },
  { cle: 'alerte', libelle: 'En alerte' },
  { cle: 'avoirs', libelle: 'Avoirs' },
];

function arrivee(prevue: Date, maintenant: Date): string {
  const jours = joursEntre(maintenant, prevue);
  if (jours < 0) return `en retard de ${-jours} ${pluriel('jour', -jours)}`;
  if (jours === 0) return 'aujourd’hui';
  if (jours === 1) return 'demain';
  return `dans ${jours} jours`;
}

/** Approvisionnement en cours, tous fournisseurs confondus. */
function Bandeau({ fournisseurs, activite }: { fournisseurs: Fournisseur[]; activite: (id: string) => ActiviteFournisseur }) {
  const maintenant = new Date();
  let enRoute = 0;
  let chezFournisseurs = 0;
  let avoirs = 0;
  let aLHeure = 0;
  let livraisons = 0;
  const enAlerte = new Set<string>();
  let prochaine: { nom: string; prevue: Date } | null = null;
  for (const f of fournisseurs) {
    const a = activite(f.id);
    if (a.enRoute > 0) chezFournisseurs += 1;
    enRoute += a.enRoute;
    avoirs += a.avoirsEnAttente.valeur;
    a.produitsEnAlerte.forEach((id) => enAlerte.add(id));
    const p = ponctualite(a, f.delaiLivraisonJours);
    if (p) {
      aLHeure += p.aLHeure;
      livraisons += p.total;
    }
    if (f.delaiLivraisonJours === null) continue;
    for (const c of a.commandes) {
      if (c.statut !== 'ENVOYEE') continue;
      const envoi = new Date(c.envoyeeAt ?? c.createdAt);
      const prevue = new Date(envoi.getFullYear(), envoi.getMonth(), envoi.getDate() + f.delaiLivraisonJours);
      if (!prochaine || prevue < prochaine.prevue) prochaine = { nom: f.nom, prevue };
    }
  }
  return (
    <section className="fournisseurs-bandeau" aria-label="Approvisionnement en cours">
      <div>
        <p className="text-[12px] font-bold tracking-[0.07em] text-white/55 uppercase">Commandes en route</p>
        <p className="mt-1.5 font-display text-[2.25rem] leading-tight font-semibold tracking-[-0.02em] max-sm:text-[1.875rem]">
          {formatNombre(enRoute)}{' '}
          {enRoute > 0 && (
            <span className="font-sans text-[0.95rem] font-semibold text-white/60">
              chez {chezFournisseurs} {pluriel('fournisseur', chezFournisseurs)}
            </span>
          )}
        </p>
        <p className="text-corps text-white/65">
          {prochaine
            ? `Prochaine arrivée attendue : ${prochaine.nom}, ${arrivee(prochaine.prevue, maintenant)}`
            : enRoute > 0
              ? 'Date d’arrivée inconnue : délai de livraison non renseigné'
              : 'Aucune commande en attente de livraison'}
        </p>
      </div>
      <div className="fournisseurs-mini">
        <div>
          <TriangleAlert className="mb-1.5 size-[18px] text-action-clair" strokeWidth={1.75} aria-hidden="true" />
          <p className="font-display text-[1.25rem] font-semibold">{formatNombre(enAlerte.size)}</p>
          <p className="text-meta text-white/60">{pluriel('produit', enAlerte.size)} en alerte, fournisseur connu</p>
        </div>
        <div>
          <Undo2 className="mb-1.5 size-[18px] text-action-clair" strokeWidth={1.75} aria-hidden="true" />
          <p className="font-display text-[1.25rem] font-semibold">{formatNombre(avoirs)}</p>
          <p className="text-meta text-white/60">GNF d’avoirs à récupérer</p>
        </div>
        <div>
          <Clock className="mb-1.5 size-[18px] text-action-clair" strokeWidth={1.75} aria-hidden="true" />
          <p className="font-display text-[1.25rem] font-semibold">{livraisons > 0 ? `${Math.round((aLHeure / livraisons) * 100)} %` : '—'}</p>
          <p className="text-meta text-white/60">
            {livraisons > 0 ? 'des livraisons dans le délai annoncé' : 'aucune livraison avec délai annoncé'}
          </p>
        </div>
      </div>
    </section>
  );
}

const sansAccents = (texte: string) =>
  texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function FournisseursPage() {
  const queryClient = useQueryClient();
  const [drawerOuvert, setDrawerOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [terme, setTerme] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const activite = useActiviteFournisseurs();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: async () => (await api.get<Fournisseur[]>('/fournisseurs')).data,
  });

  // Vue maître-détail desktop : retombe sur le premier fournisseur de la
  // liste si rien n'est sélectionné, ou si la sélection a disparu (ex.
  // fournisseur supprimé) — calculé pendant le rendu plutôt que via un
  // effet, pour éviter un rendu supplémentaire évitable.
  const selectionEffective =
    selectionId && data?.some((f) => f.id === selectionId) ? selectionId : (data?.[0]?.id ?? null);

  const cible = sansAccents(terme.trim());
  const garde = (f: Fournisseur, cle: Filtre) => {
    const a = activite(f.id);
    if (cle === 'route') return a.enRoute > 0;
    if (cle === 'alerte') return a.produitsEnAlerte.size > 0;
    if (cle === 'avoirs') return a.avoirsEnAttente.nombre > 0;
    return true;
  };
  const visibles = (data ?? []).filter(
    (f) => garde(f, filtre) && (!cible || sansAccents(`${f.nom} ${f.telephone ?? ''} ${f.emailContact ?? ''}`).includes(cible)),
  );
  const filtres = (
    <div className="fournisseurs-filtres px-3 pb-3" role="group" aria-label="Filtrer les fournisseurs">
      {FILTRES.map(({ cle, libelle }) => (
        <button key={cle} type="button" aria-pressed={filtre === cle} onClick={() => setFiltre(cle)}>
          {libelle} <b>{(data ?? []).filter((f) => garde(f, cle)).length}</b>
        </button>
      ))}
    </div>
  );
  const recherche = (
    <label className="relative block p-3">
      <Search className="absolute top-1/2 left-6 size-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
      <input
        type="search"
        value={terme}
        onChange={(e) => setTerme(e.target.value)}
        placeholder="Nom, téléphone ou email"
        aria-label="Rechercher un fournisseur"
        autoComplete="off"
        className="h-[38px] w-full rounded-md border border-rule-strong bg-surface pr-3 pl-9 text-corps text-ink-900 outline-none placeholder:text-steel-400 focus:border-action focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-action)_15%,transparent)]"
      />
    </label>
  );
  const aucun = <p className="px-4 py-6 text-corps text-steel-500">Aucun fournisseur ne correspond.</p>;

  const { register, handleSubmit, reset, formState } = useForm<Formulaire>({
    resolver: zodResolver(schema),
  });

  function ouvrirCreation() {
    setErreur(null);
    setPhotoUrl(undefined);
    reset({ nom: '', emailContact: '', telephone: '' });
    setDrawerOuvert(true);
  }

  const creer = useMutation({
    mutationFn: async (valeurs: Formulaire) =>
      api.post('/fournisseurs', {
        nom: valeurs.nom,
        ...(valeurs.emailContact ? { emailContact: valeurs.emailContact } : {}),
        ...(valeurs.telephone ? { telephone: valeurs.telephone } : {}),
        ...(photoUrl ? { photoUrl } : {}),
        ...(valeurs.delaiLivraisonJours !== undefined && !Number.isNaN(valeurs.delaiLivraisonJours)
          ? { delaiLivraisonJours: valeurs.delaiLivraisonJours }
          : {}),
      }),
    onSuccess: (reponse) => {
      queryClient.invalidateQueries({ queryKey: ['fournisseurs'] });
      setDrawerOuvert(false);
      // Sélectionne directement le fournisseur qu'on vient de créer sur
      // desktop, plutôt que de laisser l'ancienne sélection en place.
      const nouveauId = (reponse.data as { id?: string } | undefined)?.id;
      if (nouveauId) setSelectionId(nouveauId);
    },
    onError: (err) => setErreur(messageErreur(err, 'L’enregistrement a échoué.')),
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Fournisseurs"
        description="Qui vous livre quoi, en combien de temps, et ce qui est en cours chez chacun."
        action={
          <Button onClick={ouvrirCreation}>
            <Plus className="size-4" aria-hidden="true" />
            Nouveau fournisseur
          </Button>
        }
      />

      {erreur && !drawerOuvert && <Alert variant="error">{erreur}</Alert>}

      {isLoading ? (
        <Card>
          <LoadingState />
        </Card>
      ) : isError ? (
        <Card>
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        </Card>
      ) : data && data.length > 0 ? (
        <>
          <Bandeau fournisseurs={data} activite={activite} />

          {/* Desktop : vue maître-détail, liste + fiche sur le même écran */}
          <div className="hidden items-start gap-5 md:flex">
            <Card className="w-72 shrink-0 lg:w-[330px]">
              <div className="border-b border-rule">
                {recherche}
                {filtres}
              </div>
              <p className="px-4 pt-2.5 pb-1 text-meta font-semibold tracking-[0.04em] text-steel-400 uppercase">
                {visibles.length} {pluriel('fournisseur', visibles.length)}
              </p>
              {visibles.length === 0 && aucun}
              <ul className="max-h-[calc(100vh-17rem)] overflow-y-auto">
                {visibles.map((fournisseur) => (
                  <li key={fournisseur.id}>
                    <button
                      type="button"
                      onClick={() => setSelectionId(fournisseur.id)}
                      aria-current={selectionEffective === fournisseur.id ? 'true' : undefined}
                      className={cn(
                        'flex w-full items-center gap-3 border-l-[3px] py-3 pr-4 pl-[15px] text-left transition-colors',
                        selectionEffective === fournisseur.id
                          ? 'border-action bg-action-wash'
                          : 'border-transparent hover:bg-entete-tableau',
                      )}
                    >
                      <Vignette nom={fournisseur.nom} photoUrl={fournisseur.photoUrl} taille={42} teinte={teinteFournisseur(fournisseur.id)} className="rounded-full!" />
                      <div className="min-w-0">
                        <p className="truncate text-corps font-semibold text-ink-900">{fournisseur.nom}</p>
                        <p className="text-meta text-steel-400">
                          <LigneResume fournisseur={fournisseur} activite={activite(fournisseur.id)} />
                        </p>
                        <Marques activite={activite(fournisseur.id)} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            <div className="min-w-0 flex-1">
              {selectionEffective ? (
                <FournisseurDetail fournisseurId={selectionEffective} />
              ) : (
                <Card>
                  <EmptyState titre="Sélectionnez un fournisseur" description="Choisissez un contact dans la liste." />
                </Card>
              )}
            </div>
          </div>

          {/* Mobile : liste seule, navigation vers la fiche en page dédiée */}
          <Card className="md:hidden">
            <div className="border-b border-rule">
              {recherche}
              {filtres}
            </div>
            {visibles.length === 0 && aucun}
            <ul className="divide-y divide-rule">
              {visibles.map((fournisseur) => (
                <li key={fournisseur.id}>
                  <Link
                    to={`/fournisseurs/${fournisseur.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-entete-tableau"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Vignette nom={fournisseur.nom} photoUrl={fournisseur.photoUrl} taille={42} teinte={teinteFournisseur(fournisseur.id)} className="rounded-full!" />
                      <div className="min-w-0">
                        <p className="truncate text-corps font-semibold text-ink-900">{fournisseur.nom}</p>
                        <p className="text-meta text-steel-400">
                          <LigneResume fournisseur={fournisseur} activite={activite(fournisseur.id)} />
                        </p>
                        <Marques activite={activite(fournisseur.id)} />
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-steel-400" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState
            titre="Aucun fournisseur"
            description="Ajoutez un fournisseur pour suivre vos approvisionnements."
            action={<Button onClick={ouvrirCreation}>Créer un fournisseur</Button>}
          />
        </Card>
      )}

      <Drawer
        ouvert={drawerOuvert}
        onFermer={() => setDrawerOuvert(false)}
        titre="Nouveau fournisseur"
        description="Seul le nom est obligatoire."
        modifie={formState.isDirty || !!photoUrl}
        pied={
          <>
            <Button type="button" variant="secondary" onClick={() => setDrawerOuvert(false)}>
              Annuler
            </Button>
            <Button type="submit" form="formulaire-fournisseur" loading={creer.isPending}>
              Enregistrer
            </Button>
          </>
        }
      >
        <form
          id="formulaire-fournisseur"
          onSubmit={handleSubmit((valeurs) => creer.mutate(valeurs))}
          className="flex flex-col gap-4"
          noValidate
        >
          {erreur && <Alert variant="error">{erreur}</Alert>}

          <ImageUploadField label="Photo" valeur={photoUrl} dossier="fournisseurs" onChange={setPhotoUrl} forme="rond" />

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
          <Input
            label="Délai de livraison moyen, en jours (facultatif)"
            type="number"
            min={0}
            error={formState.errors.delaiLivraisonJours?.message}
            {...register('delaiLivraisonJours', { valueAsNumber: true })}
          />

        </form>
      </Drawer>
    </div>
  );
}
