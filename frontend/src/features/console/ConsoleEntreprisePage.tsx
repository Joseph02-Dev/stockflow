import { useState, type CSSProperties } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowLeftRight,
  BellRing,
  Blocks,
  CircleCheck,
  Lock,
  LockOpen,
  MapPin,
  Package,
  RotateCcwClock,
  Truck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { messageErreur } from '@/lib/api';
import { formatNombre, pluriel, tempsRelatif } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { Card, PanneauEntete } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { Onglets } from '@/components/patterns/Onglets';
import { Vignette } from '@/components/patterns/Vignette';
import { tableau } from '@/components/patterns/tableau';
import { libelleStatut, statutStock, varianteStatut } from '@/components/patterns/statutStock';
import { presentationMouvement, quantiteSignee } from '@/components/patterns/typeMouvement';
import type { TypeMouvement } from '@/components/patterns/typeMouvement';
import { apiConsole } from './api';
import { EtatBadge } from './EtatBadge';
import { ModaleSuspension } from './ModaleSuspension';
import { Pagination } from './Pagination';
import { OngletReglages } from './OngletReglages';
import type { Reglages } from './OngletReglages';
import type { Page } from './types';
import { teinteSerie } from '@/lib/teinte';
import './console.css';

interface Fiche {
  entreprise: {
    id: string;
    nom: string;
    createdAt: string;
    secteurActivite: string | null;
    statut: 'ACTIVE' | 'SUSPENDUE';
    suspendueAt: string | null;
    motifSuspension: string | null;
  };
  synthese: {
    utilisateurs: number;
    sessionsActives: number;
    emplacements: number;
    references: number;
    fournisseurs: number;
    mouvements30j: number;
    mouvementsTotal: number;
    alertesActives: number;
    commandesEnCours: number;
    derniereActivite: string | null;
  };
  reglages: Reglages;
  emplacements: {
    id: string;
    nom: string;
    adresse: string | null;
    archive: boolean;
    createdAt: string;
    referencesEnStock: number;
    quantiteTotale: number;
  }[];
  utilisateurs: {
    id: string;
    nom: string;
    email: string;
    role: 'ADMIN' | 'GESTIONNAIRE';
    createdAt: string;
    emailVerifie: boolean;
    derniereConnexion: string | null;
    sessionsActives: number;
  }[];
}

interface LigneStock {
  id: string;
  nom: string;
  reference: string | null;
  seuilAlerte: number;
  uniteMesure: string | null;
  quantite: number;
}

interface Mouvement {
  id: string;
  type: TypeMouvement;
  quantite: number;
  createdAt: string;
  produit: { nom: string; reference: string | null };
  emplacement: { nom: string };
  emplacementDestination: { nom: string } | null;
  utilisateur: { nom: string };
}

const ONGLETS = [
  { cle: 'synthese', libelle: 'Synthèse' },
  { cle: 'emplacements', libelle: 'Emplacements' },
  { cle: 'utilisateurs', libelle: 'Utilisateurs' },
  { cle: 'stock', libelle: 'Stock' },
  { cle: 'mouvements', libelle: 'Mouvements' },
  { cle: 'reglages', libelle: 'Réglages' },
] as const;
type Onglet = (typeof ONGLETS)[number]['cle'];

const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');
const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function ConsoleEntreprisePage() {
  const { id = '' } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [onglet, setOnglet] = useState<Onglet>('synthese');
  const [suspensionOuverte, setSuspensionOuverte] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const fiche = useQuery({
    queryKey: ['console', 'entreprise', id],
    queryFn: async () => (await apiConsole.get<Fiche>(`/console/entreprises/${id}`)).data,
    staleTime: 60_000,
  });

  const retablir = useMutation({
    mutationFn: async () => apiConsole.post(`/console/entreprises/${id}/retablir`, {}),
    onSuccess: () => {
      setErreur(null);
      queryClient.invalidateQueries({ queryKey: ['console'] });
    },
    onError: (e) => setErreur(messageErreur(e, 'Le rétablissement a échoué.')),
  });

  if (fiche.isLoading) return <LoadingState variante="page" />;
  if (fiche.isError || !fiche.data) {
    return <ErrorState message={messageErreur(fiche.error, 'Entreprise introuvable.')} onRetry={() => fiche.refetch()} />;
  }

  const { entreprise, synthese } = fiche.data;
  const suspendue = entreprise.statut === 'SUSPENDUE';

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/console/entreprises"
        className={boutonClasses('ghost', '-ml-3 w-fit text-steel-500', { taille: 'sm' })}
      >
        <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
        Entreprises
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Vignette nom={entreprise.nom} taille={52} teinte={teinteSerie(entreprise.id)} className="text-corps" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate font-display text-[1.625rem] font-semibold tracking-[-0.02em] text-ink-900">{entreprise.nom}</h1>
              <EtatBadge etat={suspendue ? 'SUSPENDUE' : 'ACTIVE'} />
            </div>
            <p className="mt-0.5 text-corps text-steel-500">
              {entreprise.secteurActivite && `${entreprise.secteurActivite} · `}
              Inscrite le {date(entreprise.createdAt)}
              {synthese.derniereActivite
                ? `, dernière activité ${tempsRelatif(synthese.derniereActivite, fiche.dataUpdatedAt)}`
                : ', aucune activité'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/console/journal?entrepriseId=${entreprise.id}`} className={boutonClasses('secondary')}>
            <RotateCcwClock className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Journal
          </Link>
          {suspendue ? (
            <Button loading={retablir.isPending} onClick={() => retablir.mutate()}>
              <LockOpen className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Rétablir l’accès
            </Button>
          ) : (
            <Button variant="danger" onClick={() => setSuspensionOuverte(true)}>
              <Lock className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Suspendre l’accès
            </Button>
          )}
        </div>
      </div>

      {suspendue && (
        <div className="flex items-start gap-3 rounded-lg border border-rupture/20 bg-rupture-wash px-4 py-3" role="status">
          <Lock className="mt-0.5 size-4 shrink-0 text-rupture" aria-hidden="true" />
          <p className="text-corps text-ink-900">
            Accès suspendu{entreprise.suspendueAt ? ` depuis le ${dateHeure(entreprise.suspendueAt)}` : ''}. Motif :{' '}
            <span className="font-semibold">{entreprise.motifSuspension ?? 'non précisé'}</span>. Aucun utilisateur ne peut se
            connecter ; les données sont intactes.
          </p>
        </div>
      )}
      {erreur && <Alert variant="error">{erreur}</Alert>}

      <Mesures fiche={fiche.data} />

      <Onglets onglets={ONGLETS} actif={onglet} onChange={setOnglet} libelle="Sections de la fiche" />

      {onglet === 'synthese' && <Synthese fiche={fiche.data} maintenant={fiche.dataUpdatedAt} />}
      {onglet === 'emplacements' && <Emplacements fiche={fiche.data} />}
      {onglet === 'utilisateurs' && <Utilisateurs fiche={fiche.data} maintenant={fiche.dataUpdatedAt} />}
      {onglet === 'stock' && <Stock entrepriseId={id} />}
      {onglet === 'mouvements' && <Mouvements entrepriseId={id} />}
      {onglet === 'reglages' && (
        <OngletReglages entrepriseId={id} reglages={fiche.data.reglages} />
      )}

      {suspensionOuverte && (
        <ModaleSuspension
          cible={{ id: entreprise.id, nom: entreprise.nom, utilisateurs: synthese.utilisateurs, references: synthese.references }}
          onFermer={() => setSuspensionOuverte(false)}
        />
      )}
    </div>
  );
}

function Mesure({ Icone, libelle, valeur, meta, couleur }: { Icone: LucideIcon; libelle: string; valeur: string; meta?: string; couleur?: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-meta text-steel-500">
        <Icone className="size-[15px] text-steel-400" strokeWidth={1.75} aria-hidden="true" />
        {libelle}
      </p>
      <p className="mt-1 font-display text-[1.375rem] leading-tight font-semibold" style={{ color: couleur ?? 'var(--color-ink-900)' }}>
        {valeur}
      </p>
      {meta && <p className="mt-0.5 text-meta text-steel-400">{meta}</p>}
    </div>
  );
}

/** Chiffres clés de l'entreprise, visibles quel que soit l'onglet. */
function Mesures({ fiche }: { fiche: Fiche }) {
  const s = fiche.synthese;
  const archives = fiche.emplacements.filter((e) => e.archive).length;
  const modules = Object.entries(fiche.reglages.modules);
  const actifs = modules.filter(([, actif]) => actif).length;
  const suspendue = fiche.entreprise.statut === 'SUSPENDUE';
  return (
    <section aria-label="Chiffres clés" className="console-mesures">
      <Mesure Icone={Users} libelle="Utilisateurs" valeur={formatNombre(s.utilisateurs)} meta={`${s.sessionsActives} ${pluriel('session active', s.sessionsActives, 'sessions actives')}`} />
      <Mesure Icone={MapPin} libelle="Emplacements" valeur={formatNombre(s.emplacements)} meta={archives > 0 ? `${archives} ${pluriel('archivé', archives)}` : 'aucun archivé'} />
      <Mesure Icone={Package} libelle="Références" valeur={formatNombre(s.references)} meta={`${s.fournisseurs} ${pluriel('fournisseur', s.fournisseurs)}`} />
      <Mesure Icone={ArrowLeftRight} libelle="Mouvements 30 j" valeur={formatNombre(s.mouvements30j)} meta={`${formatNombre(s.mouvementsTotal)} au total`} />
      <Mesure
        Icone={BellRing}
        libelle="Alertes actives"
        valeur={formatNombre(s.alertesActives)}
        meta="ruptures et seuils"
        couleur={s.alertesActives > 0 ? 'var(--color-faible)' : undefined}
      />
      <Mesure Icone={Truck} libelle="Commandes en cours" valeur={formatNombre(s.commandesEnCours)} meta="chez les fournisseurs" />
      <Mesure
        Icone={CircleCheck}
        libelle="Accès"
        valeur={suspendue ? 'Suspendu' : 'Ouvert'}
        meta={suspendue ? 'aucune connexion possible' : 'connexions autorisées'}
        couleur={suspendue ? 'var(--color-rupture)' : 'var(--color-ok)'}
      />
      <Mesure Icone={Blocks} libelle="Modules" valeur={`${actifs} / ${modules.length}`} meta="activés dans les réglages" />
    </section>
  );
}

const LIMITES: { cle: keyof Reglages['limites']; libelle: string; unite: [string, string] }[] = [
  { cle: 'emplacements', libelle: 'Emplacements', unite: ['emplacement', 'emplacements'] },
  { cle: 'utilisateurs', libelle: 'Utilisateurs', unite: ['utilisateur', 'utilisateurs'] },
  { cle: 'references', libelle: 'Références', unite: ['référence', 'références'] },
];
const LIBELLES_MODULES: Record<keyof Reglages['modules'], string> = { inventaires: 'Inventaires', transferts: 'Transferts' };

function Synthese({ fiche, maintenant }: { fiche: Fiche; maintenant: number }) {
  const { limites, usage, modules } = fiche.reglages;
  const utilisateurs = [...fiche.utilisateurs].sort((a, b) => (b.derniereConnexion ?? '').localeCompare(a.derniereConnexion ?? ''));
  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
      <Card>
        <PanneauEntete titre="Utilisation des limites" meta="Fixées dans les réglages" />
        <ul className="divide-y divide-rule">
          {LIMITES.map(({ cle, libelle, unite }) => {
            const limite = limites[cle];
            const utilise = usage[cle];
            const part = limite ? Math.min(1, utilise / limite) : 1;
            const atteinte = limite !== null && utilise >= limite;
            const couleur = limite === null ? 'var(--color-ok)' : atteinte ? 'var(--color-rupture)' : part >= 0.8 ? 'var(--color-faible)' : 'var(--color-action)';
            return (
              <li key={cle} className="px-5 py-3.5">
                <p className="flex justify-between gap-3 text-corps">
                  <span className="font-semibold text-ink-900">{libelle}</span>
                  <span className="text-steel-500 tabular-nums">
                    {formatNombre(utilise)} {limite === null ? '· illimité' : `/ ${formatNombre(limite)}`}
                  </span>
                </p>
                <span className="console-piste mt-2 block h-2" aria-hidden="true">
                  <i style={{ width: `${part * 100}%`, '--c': couleur, opacity: limite === null ? 0.3 : 1 } as CSSProperties} />
                </span>
                <p className="mt-1.5 text-meta text-steel-400">
                  {limite === null
                    ? 'Aucune limite'
                    : atteinte
                      ? 'Limite atteinte : aucun ajout possible'
                      : `Encore ${formatNombre(limite - utilise)} ${pluriel(unite[0], limite - utilise, unite[1])} possible${limite - utilise > 1 ? 's' : ''}`}
                </p>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2 border-t border-rule px-5 py-3.5">
          {(Object.keys(modules) as (keyof Reglages['modules'])[]).map((m) => (
            <Badge key={m} variant={modules[m] ? 'ok' : 'neutral'}>
              {LIBELLES_MODULES[m]} {modules[m] ? 'activé' : 'désactivé'}
            </Badge>
          ))}
        </div>
      </Card>

      <Card>
        <PanneauEntete titre="Utilisateurs" meta="Dernière connexion" />
        {utilisateurs.length === 0 ? (
          <EmptyState titre="Aucun utilisateur" />
        ) : (
          <ul className="divide-y divide-rule">
            {utilisateurs.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                <Vignette nom={u.nom} taille={32} teinte="var(--color-action)" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-corps font-semibold text-ink-900">{u.nom}</p>
                  <p className="truncate text-meta text-steel-400">
                    {u.role === 'ADMIN' ? 'Administrateur' : 'Gestionnaire'}
                    {u.sessionsActives > 0 && ` · ${u.sessionsActives} ${pluriel('session', u.sessionsActives)}`}
                  </p>
                </div>
                {!u.emailVerifie ? (
                  <Badge variant="faible">Email non vérifié</Badge>
                ) : (
                  <span className="shrink-0 text-meta text-steel-400">
                    {u.derniereConnexion ? tempsRelatif(u.derniereConnexion, maintenant) : 'aucune connexion'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Emplacements({ fiche }: { fiche: Fiche }) {
  return (
    <Card>
      <PanneauEntete titre="Emplacements" meta={`${fiche.emplacements.length} au total, archivés compris`} />
      {fiche.emplacements.length === 0 ? (
        <EmptyState titre="Aucun emplacement" />
      ) : (
        <table className={tableau.table}>
          <thead className={tableau.thead}>
            <tr>
              <th scope="col" className={tableau.th}>Emplacement</th>
              <th scope="col" className={cn(tableau.th, 'text-right')}>Références en stock</th>
              <th scope="col" className={cn(tableau.th, 'text-right')}>Quantité totale</th>
              <th scope="col" className={tableau.th}>Créé le</th>
            </tr>
          </thead>
          <tbody className={tableau.tbody}>
            {fiche.emplacements.map((e) => (
              <tr key={e.id}>
                <td className={tableau.td}>
                  <span className="flex items-center gap-2 font-medium text-ink-900">
                    {e.nom}
                    {e.archive && <Badge variant="neutral">Archivé</Badge>}
                  </span>
                  {e.adresse && <span className="block text-meta text-steel-500">{e.adresse}</span>}
                </td>
                <td className={cn(tableau.td, 'text-right')}>{formatNombre(e.referencesEnStock)}</td>
                <td className={cn(tableau.td, 'text-right font-semibold text-ink-900')}>{formatNombre(e.quantiteTotale)}</td>
                <td className={cn(tableau.td, 'text-steel-500')}>{date(e.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Utilisateurs({ fiche, maintenant }: { fiche: Fiche; maintenant: number }) {
  return (
    <Card>
      <PanneauEntete titre="Utilisateurs" meta="Comptes de l’entreprise — aucun mot de passe ni jeton n’est exposé" />
      <div className="relative overflow-x-auto">
        <table className={cn(tableau.table, 'min-w-[720px]')}>
          <thead className={tableau.thead}>
            <tr>
              <th scope="col" className={tableau.th}>Utilisateur</th>
              <th scope="col" className={tableau.th}>Rôle</th>
              <th scope="col" className={tableau.th}>Email vérifié</th>
              <th scope="col" className={tableau.th}>Dernière connexion</th>
              <th scope="col" className={cn(tableau.th, 'text-right')}>Sessions actives</th>
            </tr>
          </thead>
          <tbody className={tableau.tbody}>
            {fiche.utilisateurs.map((u) => (
              <tr key={u.id}>
                <td className={tableau.td}>
                  <span className="block font-medium text-ink-900">{u.nom}</span>
                  <span className="block text-meta text-steel-500">{u.email}</span>
                </td>
                <td className={tableau.td}>
                  <Badge variant={u.role === 'ADMIN' ? 'accent' : 'neutral'}>
                    {u.role === 'ADMIN' ? 'Administrateur' : 'Gestionnaire'}
                  </Badge>
                </td>
                <td className={tableau.td}>
                  <Badge variant={u.emailVerifie ? 'ok' : 'faible'}>{u.emailVerifie ? 'Vérifié' : 'Non vérifié'}</Badge>
                </td>
                <td className={cn(tableau.td, 'whitespace-nowrap text-steel-500')}>
                  {u.derniereConnexion ? tempsRelatif(u.derniereConnexion, maintenant) : 'Jamais'}
                </td>
                <td className={cn(tableau.td, 'text-right font-semibold text-ink-900')}>{u.sessionsActives}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Stock({ entrepriseId }: { entrepriseId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['console', 'entreprise', entrepriseId, 'stock', page],
    queryFn: async () =>
      (await apiConsole.get<Page<LigneStock>>(`/console/entreprises/${entrepriseId}/stock?page=${page}&taille=25`)).data,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  return (
    <Card>
      <PanneauEntete titre="Stock" meta="Quantité totale par référence, tous emplacements confondus" />
      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
      ) : data.total === 0 ? (
        <EmptyState titre="Aucune référence" />
      ) : (
        <>
          <table className={tableau.table}>
            <thead className={tableau.thead}>
              <tr>
                <th scope="col" className={tableau.th}>Référence</th>
                <th scope="col" className={cn(tableau.th, 'text-right')}>Stock</th>
                <th scope="col" className={cn(tableau.th, 'text-right')}>Seuil</th>
                <th scope="col" className={cn(tableau.th, 'w-[140px]')}>État</th>
              </tr>
            </thead>
            <tbody className={tableau.tbody}>
              {data.elements.map((p) => {
                const s = statutStock(p.quantite, p.seuilAlerte);
                return (
                  <tr key={p.id}>
                    <td className={tableau.td}>
                      <span className="block font-medium text-ink-900">{p.nom}</span>
                      <span className="block font-mono text-meta text-steel-500">{p.reference ?? '—'}</span>
                    </td>
                    <td className={cn(tableau.td, 'text-right whitespace-nowrap')}>
                      <span className="font-semibold text-ink-900">{formatNombre(p.quantite)}</span>
                      {p.uniteMesure && <span className="text-meta text-steel-400"> {p.uniteMesure}</span>}
                    </td>
                    <td className={cn(tableau.td, 'text-right text-steel-500')}>{formatNombre(p.seuilAlerte)}</td>
                    <td className={tableau.td}>
                      <Badge variant={varianteStatut[s]}>{libelleStatut[s]}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={data.page} taille={data.taille} total={data.total} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

function Mouvements({ entrepriseId }: { entrepriseId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['console', 'entreprise', entrepriseId, 'mouvements', page],
    queryFn: async () =>
      (await apiConsole.get<Page<Mouvement>>(`/console/entreprises/${entrepriseId}/mouvements?page=${page}&taille=25`)).data,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  return (
    <Card>
      <PanneauEntete titre="Mouvements" meta="Historique complet, du plus récent au plus ancien" />
      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
      ) : data.total === 0 ? (
        <EmptyState titre="Aucun mouvement" />
      ) : (
        <>
          <table className={tableau.table}>
            <thead className={tableau.thead}>
              <tr>
                <th scope="col" className={tableau.th}>Mouvement</th>
                <th scope="col" className={tableau.th}>Emplacement</th>
                <th scope="col" className={cn(tableau.th, 'text-right')}>Quantité</th>
                <th scope="col" className={tableau.th}>Date</th>
                <th scope="col" className={tableau.th}>Par</th>
              </tr>
            </thead>
            <tbody className={tableau.tbody}>
              {data.elements.map((m) => {
                const p = presentationMouvement[m.type];
                return (
                  <tr key={m.id}>
                    <td className={cn(tableau.td, 'py-2.5')}>
                      <span className="flex items-center gap-3">
                        <span className={cn('flex size-[26px] shrink-0 items-center justify-center rounded-sm', p.fond)} aria-hidden="true">
                          <p.Icone className="size-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink-900">{m.produit.nom}</span>
                          <span className="block text-meta text-steel-500">{p.libelle}</span>
                        </span>
                      </span>
                    </td>
                    <td className={cn(tableau.td, 'text-steel-700')}>
                      {m.emplacementDestination ? `${m.emplacement.nom} vers ${m.emplacementDestination.nom}` : m.emplacement.nom}
                    </td>
                    <td className={cn(tableau.td, 'text-right font-semibold whitespace-nowrap', p.couleur)}>
                      {quantiteSignee(m.type, m.quantite)}
                    </td>
                    <td className={cn(tableau.td, 'whitespace-nowrap text-steel-500')}>{dateHeure(m.createdAt)}</td>
                    <td className={cn(tableau.td, 'text-steel-500')}>{m.utilisateur.nom}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={data.page} taille={data.taille} total={data.total} onChange={setPage} />
        </>
      )}
    </Card>
  );
}
