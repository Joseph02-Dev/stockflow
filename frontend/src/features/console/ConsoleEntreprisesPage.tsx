import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Lock, Search, Unlock } from 'lucide-react';
import { messageErreur } from '@/lib/api';
import { formatNombre, tempsRelatif } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Alert } from '@/components/ui/Alert';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { tableau } from '@/components/patterns/tableau';
import { apiConsole } from './api';
import { EtatBadge } from './EtatBadge';
import { MenuActions } from './MenuActions';
import { ModaleSuspension } from './ModaleSuspension';
import type { CibleSuspension } from './ModaleSuspension';
import { LIBELLES_ETAT } from './types';
import type { EtatEntreprise, LigneEntreprise } from './types';

const FILTRES: (EtatEntreprise | 'TOUTES')[] = ['TOUTES', 'ACTIVE', 'INACTIVE', 'JAMAIS_DEMARREE', 'SUSPENDUE'];

export function ConsoleEntreprisesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<EtatEntreprise | 'TOUTES'>('TOUTES');
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

  // Filtrage local : une seule lecture (journalisée) alimente la recherche,
  // les filtres et leurs compteurs.
  const comptes = useMemo(() => {
    const c: Record<string, number> = { TOUTES: data?.length ?? 0 };
    for (const l of data ?? []) c[l.etat] = (c[l.etat] ?? 0) + 1;
    return c;
  }, [data]);
  const terme = recherche.trim().toLowerCase();
  const lignes = (data ?? []).filter(
    (l) => (filtre === 'TOUTES' || l.etat === filtre) && (!terme || l.nom.toLowerCase().includes(terme)),
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader titre="Entreprises" description="Toutes les entreprises inscrites, avec leur activité réelle." />

      <div className="flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel-400" aria-hidden="true" />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher une entreprise…"
            aria-label="Rechercher une entreprise"
            className="h-9 w-full rounded-md border border-rule-strong bg-surface pr-3 pl-9 text-corps text-ink-900 placeholder:text-steel-400 hover:border-steel-400 focus:border-console"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par état">
          {FILTRES.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtre === f}
              onClick={() => setFiltre(f)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-corps whitespace-nowrap transition-colors',
                filtre === f
                  ? 'border-console/30 bg-console-wash font-medium text-console'
                  : 'border-rule bg-surface text-steel-700 hover:border-rule-strong',
              )}
            >
              {f === 'TOUTES' ? 'Toutes' : LIBELLES_ETAT[f]}
              <span className={cn('text-meta', filtre === f ? 'text-console/70' : 'text-steel-400')}>{comptes[f] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {erreur && <Alert variant="error">{erreur}</Alert>}

      <Card>
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState message={messageErreur(error)} onRetry={() => refetch()} />
        ) : lignes.length === 0 ? (
          <EmptyState titre="Aucune entreprise" description="Aucune entreprise ne correspond à ces critères." />
        ) : (
          <div className="relative overflow-x-auto">
            <table className={cn(tableau.table, 'min-w-[900px]')}>
              <thead className={tableau.thead}>
                <tr>
                  <th scope="col" className={tableau.th}>Entreprise</th>
                  <th scope="col" className={cn(tableau.th, 'text-right')}>Emplacements</th>
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
                        <Vignette nom={l.nom} taille={34} />
                        <span className="min-w-0">
                          <span className="block max-w-[260px] truncate font-medium text-ink-900 group-hover:underline">
                            {l.nom}
                          </span>
                          <span className="block text-meta text-steel-500">
                            Inscrite le {new Date(l.createdAt).toLocaleDateString('fr-FR')}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className={cn(tableau.td, 'text-right')}>{formatNombre(l.emplacements)}</td>
                    <td className={cn(tableau.td, 'text-right')}>{formatNombre(l.utilisateurs)}</td>
                    <td className={cn(tableau.td, 'text-right')}>{formatNombre(l.references)}</td>
                    <td className={cn(tableau.td, 'text-right font-semibold text-ink-900')}>{formatNombre(l.mouvements30j)}</td>
                    <td className={cn(tableau.td, 'whitespace-nowrap text-steel-500')}>
                      {l.derniereActivite ? tempsRelatif(l.derniereActivite, dataUpdatedAt) : 'Aucune'}
                    </td>
                    <td className={tableau.td}>
                      <EtatBadge etat={l.etat} />
                    </td>
                    <td className={cn(tableau.td, 'text-right')}>
                      <MenuActions
                        libelle={`Actions pour ${l.nom}`}
                        actions={[
                          { libelle: 'Ouvrir la fiche', Icone: Eye, onSelect: () => navigate(`/console/entreprises/${l.id}`) },
                          l.statut === 'SUSPENDUE'
                            ? { libelle: 'Rétablir l’accès', Icone: Unlock, onSelect: () => retablir.mutate(l.id) }
                            : {
                                libelle: 'Suspendre l’accès',
                                Icone: Lock,
                                danger: true,
                                onSelect: () =>
                                  setCible({ id: l.id, nom: l.nom, utilisateurs: l.utilisateurs, references: l.references }),
                              },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ModaleSuspension cible={cible} onFermer={() => setCible(null)} />
    </div>
  );
}
