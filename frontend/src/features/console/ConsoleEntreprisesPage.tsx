import { useMemo, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Lock, LockOpen, Search } from 'lucide-react';
import { messageErreur } from '@/lib/api';
import { formatNombre, pluriel, tempsRelatif } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Alert } from '@/components/ui/Alert';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { tableau } from '@/components/patterns/tableau';
import { teinteSerie } from '@/lib/teinte';
import { apiConsole } from './api';
import { EtatBadge } from './EtatBadge';
import { MenuActions } from './MenuActions';
import { ModaleSuspension } from './ModaleSuspension';
import type { CibleSuspension } from './ModaleSuspension';
import { LIBELLES_ETAT } from './types';
import type { EtatEntreprise, LigneEntreprise } from './types';
import './console.css';

const FILTRES: { cle: EtatEntreprise | 'TOUTES'; couleur?: string }[] = [
  { cle: 'TOUTES' },
  { cle: 'ACTIVE', couleur: 'var(--color-ok)' },
  { cle: 'INACTIVE', couleur: 'var(--color-faible)' },
  { cle: 'JAMAIS_DEMARREE', couleur: 'var(--color-steel-500)' },
  { cle: 'SUSPENDUE', couleur: 'var(--color-rupture)' },
];

type Tri = 'activite' | 'recente' | 'inscription' | 'nom';
const TRIS: { cle: Tri; libelle: string }[] = [
  { cle: 'activite', libelle: 'Plus actives d’abord' },
  { cle: 'recente', libelle: 'Dernière activité' },
  { cle: 'inscription', libelle: 'Plus récentes' },
  { cle: 'nom', libelle: 'Nom' },
];

function comparer(tri: Tri) {
  return (a: LigneEntreprise, b: LigneEntreprise): number => {
    if (tri === 'activite') return b.mouvements30j - a.mouvements30j || a.nom.localeCompare(b.nom, 'fr');
    if (tri === 'recente') return (b.derniereActivite ?? '').localeCompare(a.derniereActivite ?? '');
    if (tri === 'inscription') return b.createdAt.localeCompare(a.createdAt);
    return a.nom.localeCompare(b.nom, 'fr');
  };
}

export function ConsoleEntreprisesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<EtatEntreprise | 'TOUTES'>('TOUTES');
  const [tri, setTri] = useState<Tri>('activite');
  const [cible, setCible] = useState<CibleSuspension | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['console', 'entreprises'],
    queryFn: async () => (await apiConsole.get<LigneEntreprise[]>('/console/entreprises')).data,
    staleTime: 60_000,
  });

  const retablir = useMutation({
    mutationFn: async (id: string) => apiConsole.post(`/console/entreprises/${id}/retablir`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['console'] }),
    onError: (e) => setErreur(messageErreur(e, 'Le rétablissement a échoué.')),
  });

  // Filtrage et tri locaux : une seule lecture (journalisée) alimente la
  // recherche, les filtres, leurs compteurs et le tri.
  const comptes = useMemo(() => {
    const c: Record<string, number> = { TOUTES: data?.length ?? 0 };
    for (const l of data ?? []) c[l.etat] = (c[l.etat] ?? 0) + 1;
    return c;
  }, [data]);
  const terme = recherche.trim().toLowerCase();
  const lignes = (data ?? [])
    .filter((l) => (filtre === 'TOUTES' || l.etat === filtre) && (!terme || l.nom.toLowerCase().includes(terme)))
    .sort(comparer(tri));
  const plusActive = Math.max(1, ...(data ?? []).map((l) => l.mouvements30j));

  const actions = (l: LigneEntreprise) => [
    { libelle: 'Ouvrir la fiche', Icone: Eye, onSelect: () => navigate(`/console/entreprises/${l.id}`) },
    l.statut === 'SUSPENDUE'
      ? { libelle: 'Rétablir l’accès', Icone: LockOpen, onSelect: () => retablir.mutate(l.id) }
      : {
          libelle: 'Suspendre l’accès',
          Icone: Lock,
          danger: true,
          onSelect: () => setCible({ id: l.id, nom: l.nom, utilisateurs: l.utilisateurs, references: l.references }),
        },
  ];
  const derniere = (l: LigneEntreprise) => (l.derniereActivite ? tempsRelatif(l.derniereActivite, dataUpdatedAt) : 'Aucune');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader titre="Entreprises" description="Toutes les entreprises inscrites, avec leur activité réelle." />

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5" role="group" aria-label="Filtrer par état">
        {FILTRES.map(({ cle, couleur }) => (
          <button
            key={cle}
            type="button"
            aria-pressed={filtre === cle}
            onClick={() => setFiltre(cle)}
            className={cn('console-filtre', cle === 'TOUTES' && 'max-md:col-span-2')}
            style={couleur ? ({ '--c': couleur } as CSSProperties) : undefined}
          >
            <b>{formatNombre(comptes[cle] ?? 0)}</b>
            <span>
              {couleur && <i aria-hidden="true" />}
              {cle === 'TOUTES' ? 'Toutes' : LIBELLES_ETAT[cle]}
            </span>
          </button>
        ))}
      </div>

      {erreur && <Alert variant="error">{erreur}</Alert>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-rule px-4 py-3 sm:px-5">
          <h2 className="text-[1.0625rem] font-semibold text-ink-900">
            {formatNombre(lignes.length)} {pluriel('entreprise', lignes.length)}
          </h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher une entreprise…"
                aria-label="Rechercher une entreprise"
                className="champ h-9 w-full rounded-md border border-rule-strong bg-paper pr-3 pl-9 text-corps text-ink-900 placeholder:text-steel-400"
              />
            </div>
            <select
              value={tri}
              onChange={(e) => setTri(e.target.value as Tri)}
              aria-label="Trier les entreprises"
              className="champ h-9 rounded-md border border-rule-strong bg-paper px-2.5 text-corps text-ink-900 max-sm:w-full"
            >
              {TRIS.map((t) => (
                <option key={t.cle} value={t.cle}>
                  {t.libelle}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : lignes.length === 0 ? (
          <EmptyState titre="Aucune entreprise" description="Aucune entreprise ne correspond à ces critères." />
        ) : (
          <>
            <div className="relative hidden overflow-x-auto md:block">
              <table className={cn(tableau.table, 'min-w-[900px]')}>
                <thead className={tableau.thead}>
                  <tr>
                    <th scope="col" className={tableau.th}>Entreprise</th>
                    <th scope="col" className={cn(tableau.th, 'text-right')}>Emplac.</th>
                    <th scope="col" className={cn(tableau.th, 'text-right')}>Utilisateurs</th>
                    <th scope="col" className={cn(tableau.th, 'text-right')}>Références</th>
                    <th scope="col" className={cn(tableau.th, 'text-right')}>Mouvements 30 j</th>
                    <th scope="col" className={tableau.th}>Dernière activité</th>
                    <th scope="col" className={cn(tableau.th, 'min-w-[140px]')}>État</th>
                    <th scope="col" className={cn(tableau.th, 'w-12')}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className={tableau.tbody}>
                  {lignes.map((l) => (
                    <tr key={l.id} className={tableau.tr}>
                      <td className={cn(tableau.td, 'py-2.5')}>
                        <Link to={`/console/entreprises/${l.id}`} className="group flex min-w-0 items-center gap-3">
                          <Vignette nom={l.nom} taille={36} teinte={teinteSerie(l.id)} />
                          <span className="min-w-0">
                            <span className="block max-w-[260px] truncate font-semibold text-ink-900 group-hover:underline">
                              {l.nom}
                            </span>
                            <span className="block text-meta text-steel-400">
                              Inscrite le {new Date(l.createdAt).toLocaleDateString('fr-FR')}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className={cn(tableau.td, 'text-right')}>{formatNombre(l.emplacements)}</td>
                      <td className={cn(tableau.td, 'text-right')}>{formatNombre(l.utilisateurs)}</td>
                      <td className={cn(tableau.td, 'text-right')}>{formatNombre(l.references)}</td>
                      <td className={cn(tableau.td, 'text-right')}>
                        <span className="flex items-center justify-end gap-2.5">
                          <span className="font-semibold text-ink-900">{formatNombre(l.mouvements30j)}</span>
                          <span className="console-piste w-[70px]" aria-hidden="true">
                            <i style={{ width: `${(l.mouvements30j / plusActive) * 100}%` }} />
                          </span>
                        </span>
                      </td>
                      <td className={cn(tableau.td, 'whitespace-nowrap text-steel-500')}>{derniere(l)}</td>
                      <td className={tableau.td}>
                        <EtatBadge etat={l.etat} />
                      </td>
                      <td className={cn(tableau.td, 'text-right')}>
                        <MenuActions libelle={`Actions pour ${l.nom}`} actions={actions(l)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Téléphone : une carte par entreprise, les trois chiffres utiles. */}
            <ul className="divide-y divide-rule md:hidden">
              {lignes.map((l) => (
                <li key={l.id}>
                  <Link to={`/console/entreprises/${l.id}`} className="flex flex-col gap-2.5 px-4 py-3.5">
                    <span className="flex items-center justify-between gap-2.5">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Vignette nom={l.nom} taille={36} teinte={teinteSerie(l.id)} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink-900">{l.nom}</span>
                          <span className="block text-meta text-steel-400">
                            {l.derniereActivite ? `Actif ${derniere(l)}` : 'Aucune activité'}
                          </span>
                        </span>
                      </span>
                      <EtatBadge etat={l.etat} />
                    </span>
                    <span className="grid grid-cols-3 gap-2 text-meta text-steel-400">
                      <span>
                        <b className="block font-display text-[1rem] font-semibold text-ink-900">{formatNombre(l.mouvements30j)}</b>
                        mvts 30 j
                      </span>
                      <span>
                        <b className="block font-display text-[1rem] font-semibold text-ink-900">{formatNombre(l.utilisateurs)}</b>
                        {pluriel('utilisateur', l.utilisateurs)}
                      </span>
                      <span>
                        <b className="block font-display text-[1rem] font-semibold text-ink-900">{formatNombre(l.references)}</b>
                        {pluriel('référence', l.references)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <ModaleSuspension cible={cible} onFermer={() => setCible(null)} />
    </div>
  );
}
