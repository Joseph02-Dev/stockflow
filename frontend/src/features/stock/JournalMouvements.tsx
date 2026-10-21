import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { presentationMouvement, quantiteSignee, type TypeMouvement } from '@/components/patterns/typeMouvement';
import { messageErreur } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNombre, pluriel } from '@/lib/format';
import { trajetMouvement, type NatureEmplacement } from '@/lib/natureEmplacement';

/**
 * Onglet « Mouvements » : le journal, regroupé par jour, filtré par
 * familles de types côté serveur (paramètre `type`), chargé par pages de
 * 50. Le type n'est jamais porté par la couleur seule : icône et libellé.
 * Styles dans stock.css.
 */

export interface Mouvement {
  id: string;
  type: TypeMouvement;
  quantite: number;
  createdAt: string;
  produit: { nom: string };
  emplacement: { nom: string };
  emplacementDestination: { nom: string } | null;
  origine?: NatureEmplacement;
  /** Saisi en conditionnement (carton…) : facteur figé au mouvement. */
  conditionnement?: { nom: string } | null;
  facteurConditionnement?: number | null;
  destination?: NatureEmplacement;
  utilisateur: { nom: string };
  fournisseur: { nom: string } | null;
  vente: { id: string; numero: string } | null;
}

export const FAMILLES = [
  { cle: 'tous', libelle: 'Tous', types: [], teinte: '' },
  { cle: 'entrees', libelle: 'Entrées', types: ['ENTREE'], teinte: 'var(--color-ok)' },
  { cle: 'sorties', libelle: 'Ventes et sorties', types: ['SORTIE'], teinte: 'var(--color-faible)' },
  { cle: 'transferts', libelle: 'Transferts', types: ['TRANSFERT'], teinte: 'var(--color-action)' },
  { cle: 'ajustements', libelle: 'Ajustements', types: ['AJUSTEMENT'], teinte: 'var(--color-accent)' },
  { cle: 'pertes', libelle: 'Pertes', types: ['PERIME', 'CASSE'], teinte: 'var(--color-rupture)' },
  { cle: 'retours', libelle: 'Retours', types: ['RETOUR_CLIENT', 'RETOUR_FOURNISSEUR'], teinte: 'var(--color-steel-500)' },
] as const satisfies readonly { cle: string; libelle: string; types: readonly TypeMouvement[]; teinte: string }[];

export type CleFamille = (typeof FAMILLES)[number]['cle'];

const heure = (date: Date) => date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function libelleJour(date: Date): string {
  const veille = new Date();
  veille.setDate(veille.getDate() - 1);
  if (date.toDateString() === new Date().toDateString()) return 'Aujourd’hui';
  if (date.toDateString() === veille.toDateString()) return 'Hier';
  const texte = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

export function JournalMouvements({
  requete,
  famille,
  onFamille,
  onNouveauMouvement,
}: {
  requete: UseInfiniteQueryResult<InfiniteData<Mouvement[]>>;
  famille: CleFamille;
  onFamille: (cle: CleFamille) => void;
  onNouveauMouvement: () => void;
}) {
  const liste = requete.data?.pages.flat() ?? [];

  const jours: { cle: string; date: Date; mouvements: Mouvement[] }[] = [];
  for (const mouvement of liste) {
    const date = new Date(mouvement.createdAt);
    const cle = date.toDateString();
    const dernier = jours.at(-1);
    if (dernier?.cle === cle) dernier.mouvements.push(mouvement);
    else jours.push({ cle, date, mouvements: [mouvement] });
  }

  let rang = 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="-m-0.5 flex gap-1.5 overflow-x-auto p-0.5 [scrollbar-width:none]" role="group" aria-label="Type de mouvement">
        {FAMILLES.map((f) => (
          <button
            key={f.cle}
            type="button"
            className="stock-puce"
            aria-pressed={famille === f.cle}
            onClick={() => onFamille(f.cle)}
            style={{ '--teinte': f.teinte } as CSSProperties}
          >
            {f.teinte && <i aria-hidden="true" />}
            {f.libelle}
          </button>
        ))}
      </div>

      {requete.isLoading ? (
        <Card>
          <LoadingState />
        </Card>
      ) : requete.isError ? (
        <Card>
          <ErrorState message={messageErreur(requete.error)} onRetry={() => requete.refetch()} />
        </Card>
      ) : liste.length === 0 ? (
        <Card>
          {famille === 'tous' ? (
            <EmptyState
              titre="Aucun mouvement"
              description="L’historique se remplira au fil de vos entrées et sorties de stock."
              action={<Button onClick={onNouveauMouvement}>Enregistrer un mouvement</Button>}
            />
          ) : (
            <EmptyState
              titre="Aucun mouvement de ce type"
              description="Choisissez un autre type, ou revenez à l’historique complet."
              action={
                <Button variant="secondary" onClick={() => onFamille('tous')}>
                  Voir tous les mouvements
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {jours.map((jour, index) => {
            // Le dernier jour chargé peut continuer sur la page suivante : pas de total incomplet.
            const complet = index < jours.length - 1 || !requete.hasNextPage;
            return (
              <section key={jour.cle} aria-label={libelleJour(jour.date)}>
                <h3 className="stock-jour-titre">
                  <span className="text-corps font-semibold text-ink-900">{libelleJour(jour.date)}</span>
                  {complet && (
                    <span className="text-meta text-steel-400">
                      {jour.mouvements.length} {pluriel('mouvement', jour.mouvements.length)}
                    </span>
                  )}
                </h3>
                <Card>
                  <ul className="divide-y divide-rule">
                    {jour.mouvements.map((m) => {
                      const p = presentationMouvement[m.type];
                      const date = new Date(m.createdAt);
                      return (
                        <li
                          key={m.id}
                          className="stock-mvt stock-apparition"
                          style={{ animationDelay: `${Math.min(rang++, 12) * 35}ms` }}
                        >
                          <span className="text-right font-mono text-meta text-steel-400">{heure(date)}</span>
                          <span className={cn('stock-type', p.fond)} aria-hidden="true">
                            <p.Icone className="size-[18px]" />
                          </span>
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-baseline gap-x-2">
                              <span className="font-semibold text-ink-900">{m.produit.nom}</span>
                              <span className={cn('text-meta font-semibold', p.couleur)}>
                                {m.vente ? (
                                  <>
                                    {m.type === 'SORTIE' ? 'Vente' : `${p.libelle} ·`}{' '}
                                    <Link to={`/ventes/${m.vente.id}`} className="font-mono text-action hover:underline">
                                      {m.vente.numero}
                                    </Link>
                                  </>
                                ) : (
                                  p.libelle
                                )}
                              </span>
                            </p>
                            <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-meta text-steel-500">
                              <span className="stock-heure-mobile font-mono">{heure(date)}</span>
                              <span>{trajetMouvement(m)}</span>
                              {m.fournisseur && <span>· {m.fournisseur.nom}</span>}
                              <span>· par {m.utilisateur.nom}</span>
                            </p>
                          </div>
                          <div className="text-right whitespace-nowrap">
                            <p className={cn('font-mono text-[1rem] font-semibold', p.couleur)}>
                              {quantiteSignee(m.type, m.quantite)}
                            </p>
                            {m.conditionnement && m.facteurConditionnement && (
                              <p className="text-meta text-steel-400">
                                {formatNombre(m.quantite / m.facteurConditionnement)} × {m.conditionnement.nom}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </section>
            );
          })}
          {requete.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" loading={requete.isFetchingNextPage} onClick={() => requete.fetchNextPage()}>
                Charger plus de mouvements
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
