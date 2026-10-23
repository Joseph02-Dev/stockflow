import { useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, TriangleAlert, Undo2, X } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatNombre, pluriel } from '@/lib/format';
import { gnf } from '@/lib/montant';
import { joursEntre } from '@/lib/periode';
import { teinteSerie } from '@/lib/teinte';
import { cn } from '@/lib/cn';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { FormulaireRetourFournisseur } from './FormulaireRetourFournisseur';
import type { ListeRetoursFournisseur, RetourFournisseur } from './types';
import './retours.css';

const dateCourte = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

type Filtre = 'TOUS' | 'RECU' | 'REFUSE';
const FILTRES: readonly [Filtre, string][] = [
  ['TOUS', 'Tous'],
  ['RECU', 'Avoir reçu'],
  ['REFUSE', 'Refusés'],
];

/** Gris la première semaine, orange ensuite, rouge au-delà d'un mois. */
function couleurAge(jours: number): string {
  if (jours > 30) return 'var(--color-rupture)';
  if (jours >= 7) return 'var(--color-faible)';
  return 'var(--color-steel-500)';
}

function libelleAge(jours: number): string {
  if (jours <= 0) return 'aujourd’hui';
  if (jours === 1) return 'hier';
  return `il y a ${jours} j`;
}

function couleurTaux(pourcentage: number): string {
  if (pourcentage >= 80) return 'var(--color-ok)';
  if (pourcentage >= 50) return 'var(--color-faible)';
  return 'var(--color-rupture)';
}

/** Date de clôture d'un retour : avoir reçu ou refus. */
function dateCloture(r: RetourFournisseur): Date {
  return new Date(r.avoirRecuAt ?? r.refuseAt ?? r.createdAt);
}

/**
 * Un produit renvoyé sans prix d'achat (le serveur l'enregistre alors à 0) :
 * la valeur du retour est sous-estimée.
 */
function valeurIncomplete(r: RetourFournisseur): boolean {
  return r.mouvements.some((m) => !m.valeurUnitaire);
}

/** « 30 000 », « au moins 30 000 », ou « — » quand aucun prix n'est connu. */
function montant(valeur: number, incomplete: boolean): string {
  if (!incomplete) return formatNombre(valeur);
  return valeur === 0 ? '—' : `au moins ${formatNombre(valeur)}`;
}

function resumeProduits(r: RetourFournisseur): string {
  const [premier, ...autres] = r.mouvements;
  if (!premier) return '';
  const texte = `${formatNombre(premier.quantite)} × ${premier.produit.nom}`;
  return autres.length === 0 ? texte : `${texte} + ${autres.length} ${pluriel('autre', autres.length)}`;
}

/**
 * Marchandise renvoyée aux fournisseurs et suivi des avoirs. Un avoir
 * refusé ne touche plus au stock (sorti au renvoi) : sa valeur rejoint
 * les pertes du mois.
 *
 * Tout est calculé à partir de la liste (les 200 retours les plus récents) ;
 * seul le total des avoirs en attente vient du serveur, qui les compte tous.
 */
export function RetoursFournisseurPage() {
  const queryClient = useQueryClient();
  const [creation, setCreation] = useState(false);
  const [succes, setSucces] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('TOUS');
  const [recherche, setRecherche] = useState('');

  const liste = useQuery({
    queryKey: ['retours-fournisseur'],
    queryFn: async () => (await api.get<ListeRetoursFournisseur>('/retours-fournisseur')).data,
  });

  const avoir = useMutation({
    mutationFn: async ({ retour, statut }: { retour: RetourFournisseur; statut: 'RECU' | 'REFUSE' }) =>
      (await api.patch<RetourFournisseur>(`/retours-fournisseur/${retour.id}/avoir`, { statut })).data,
    onSuccess: (retour) => {
      queryClient.invalidateQueries({ queryKey: ['retours-fournisseur'] });
      queryClient.invalidateQueries({ queryKey: ['pertes'] });
      setErreur(null);
      setSucces(
        retour.statutAvoir === 'RECU'
          ? `Avoir de ${retour.fournisseur.nom} reçu : ${gnf(retour.valeurTotale)}.`
          : `Avoir refusé : ${gnf(retour.valeurTotale)} passent en pertes, sans nouvelle sortie de stock.`,
      );
    },
    onError: (e) => setErreur(messageErreur(e, 'La mise à jour de l’avoir a échoué.')),
  });

  const maintenant = new Date();
  const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  const retours = liste.data?.retours ?? [];
  const attente = liste.data?.avoirsEnAttente ?? { nombre: 0, valeur: 0 };

  // Avoirs attendus, regroupés par fournisseur : le plus ancien retour d'abord.
  const attendus = retours
    .filter((r) => r.statutAvoir === 'ATTENDU')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const groupes = new Map<string, { id: string; nom: string; retours: RetourFournisseur[]; valeur: number; incomplete: boolean }>();
  for (const r of attendus) {
    const g = groupes.get(r.fournisseur.id) ?? { id: r.fournisseur.id, nom: r.fournisseur.nom, retours: [], valeur: 0, incomplete: false };
    g.retours.push(r);
    g.valeur += r.valeurTotale;
    g.incomplete ||= valeurIncomplete(r);
    groupes.set(r.fournisseur.id, g);
  }
  const plusAncien = attendus[0];
  const agePlusAncien = plusAncien ? joursEntre(new Date(plusAncien.createdAt), maintenant) : 0;

  const clos = retours.filter((r) => r.statutAvoir !== 'ATTENDU').sort((a, b) => dateCloture(b).getTime() - dateCloture(a).getTime());
  const recus = clos.filter((r) => r.statutAvoir === 'RECU');
  const recusCeMois = recus.filter((r) => dateCloture(r) >= debutMois);
  const refusCeMois = clos.filter((r) => r.statutAvoir === 'REFUSE' && dateCloture(r) >= debutMois);
  const somme = (liste: RetourFournisseur[]) => liste.reduce((s, r) => s + r.valeurTotale, 0);
  const delaiMoyen =
    recus.length === 0
      ? null
      : Math.round(recus.reduce((s, r) => s + joursEntre(new Date(r.createdAt), dateCloture(r)), 0) / recus.length);

  // Part d'avoirs obtenus par fournisseur, sur les retours clos.
  const parFournisseur = new Map<string, { id: string; nom: string; recus: number; refus: number }>();
  for (const r of clos) {
    const f = parFournisseur.get(r.fournisseur.id) ?? { id: r.fournisseur.id, nom: r.fournisseur.nom, recus: 0, refus: 0 };
    if (r.statutAvoir === 'RECU') f.recus += 1;
    else f.refus += 1;
    parFournisseur.set(r.fournisseur.id, f);
  }
  const taux = [...parFournisseur.values()]
    .map((f) => ({ ...f, total: f.recus + f.refus, pourcentage: Math.round((f.recus / (f.recus + f.refus)) * 100) }))
    .sort((a, b) => b.pourcentage - a.pourcentage || b.total - a.total);

  const terme = recherche.trim().toLocaleLowerCase('fr');
  const closVisibles = clos.filter(
    (r) =>
      (filtre === 'TOUS' || r.statutAvoir === filtre) &&
      (!terme ||
        r.fournisseur.nom.toLocaleLowerCase('fr').includes(terme) ||
        r.mouvements.some((m) => m.produit.nom.toLocaleLowerCase('fr').includes(terme))),
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Retours fournisseur"
        description="La marchandise renvoyée sort du stock au départ ; suivez ici les avoirs à récupérer."
        action={
          <Button onClick={() => setCreation(true)}>
            <Undo2 className="size-4" aria-hidden="true" />
            Nouveau retour
          </Button>
        }
      />

      {succes && <Alert variant="success">{succes}</Alert>}
      {erreur && <Alert variant="error">{erreur}</Alert>}

      {liste.isLoading ? (
        <LoadingState />
      ) : liste.isError ? (
        <Card>
          <ErrorState message={messageErreur(liste.error)} onRetry={() => liste.refetch()} />
        </Card>
      ) : retours.length === 0 ? (
        <Card>
          <EmptyState
            titre="Aucun retour fournisseur"
            description="Un lot défectueux, une mauvaise référence livrée : renvoyez-le ici pour suivre l’avoir."
            action={<Button onClick={() => setCreation(true)}>Nouveau retour</Button>}
          />
        </Card>
      ) : (
        <>
          <section className="retours-bandeau" aria-label="Résumé des avoirs">
            <div>
              <p className="retours-sur">Avoirs à récupérer</p>
              <p className="mt-1.5 font-display text-[2.25rem] leading-tight font-semibold tracking-[-0.02em] max-sm:text-[1.875rem]">
                {attendus.some(valeurIncomplete) && attente.valeur > 0 && (
                  <span className="text-[1.125rem] font-medium text-white/60">au moins </span>
                )}
                {formatNombre(attente.valeur)} <span className="font-sans text-[0.95rem] font-semibold text-white/60">GNF</span>
              </p>
              <p className="text-corps text-white/65">
                {attente.nombre === 0
                  ? 'Aucun avoir en attente'
                  : `${formatNombre(attente.nombre)} ${pluriel('avoir attendu', attente.nombre, 'avoirs attendus')} chez ${groupes.size} ${pluriel('fournisseur', groupes.size)}`}
              </p>
              {plusAncien && agePlusAncien >= 7 && (
                <p className="retours-alerte">
                  <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                  Le plus ancien attend depuis {agePlusAncien} jours : {plusAncien.fournisseur.nom}
                </p>
              )}
            </div>
            <div className="retours-mini">
              <div style={{ '--c': '#3ebe94' } as CSSProperties}>
                <i aria-hidden="true" />
                <b>{montant(somme(recusCeMois), recusCeMois.some(valeurIncomplete))}</b>
                <span>GNF récupérés ce mois</span>
              </div>
              <div style={{ '--c': '#f0705f' } as CSSProperties}>
                <i aria-hidden="true" />
                <b>{montant(somme(refusCeMois), refusCeMois.some(valeurIncomplete))}</b>
                <span>GNF refusés ce mois, passés en pertes</span>
              </div>
              <div style={{ '--c': '#e8b33c' } as CSSProperties}>
                <i aria-hidden="true" />
                <b>{delaiMoyen === null ? '—' : `${delaiMoyen} ${pluriel('jour', delaiMoyen)}`}</b>
                <span>délai moyen pour obtenir un avoir</span>
              </div>
            </div>
          </section>

          <Card>
            <div className="retours-bloc-tete">
              <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold text-ink-900">
                Avoirs à relancer <span className="retours-nombre">{attendus.length}</span>
              </h2>
              <p className="text-meta text-steel-400">Regroupés par fournisseur, les plus anciens d’abord</p>
            </div>
            {groupes.size === 0 ? (
              <p className="px-5 py-8 text-center text-corps text-steel-500">Aucun avoir en attente : tous les retours sont réglés.</p>
            ) : (
              <ul className="divide-y divide-rule">
                {[...groupes.values()].map((g) => (
                  <li key={g.id} className="retours-groupe">
                    <div className="flex items-center gap-2.5">
                      <Vignette nom={g.nom} taille={38} teinte={teinteSerie(g.id)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.9375rem] font-semibold text-ink-900">{g.nom}</p>
                        <p className="text-meta text-steel-400">
                          {g.retours.length} {pluriel('retour', g.retours.length)} en attente d’avoir
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display text-[1.0625rem] font-semibold text-faible">{montant(g.valeur, g.incomplete)}</p>
                        <p className="text-meta text-steel-400">
                          {g.incomplete && g.valeur === 0 ? 'prix d’achat manquant' : 'GNF à récupérer'}
                        </p>
                      </div>
                    </div>
                    <div className="retours-cartes">
                      {g.retours.map((r) => (
                        <CarteRetour
                          key={r.id}
                          retour={r}
                          jours={joursEntre(new Date(r.createdAt), maintenant)}
                          enCours={avoir.isPending && avoir.variables?.retour.id === r.id ? avoir.variables.statut : null}
                          bloque={avoir.isPending}
                          onAvoir={(statut) => avoir.mutate({ retour: r, statut })}
                        />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {taux.length > 0 && (
            <Card>
              <div className="retours-bloc-tete">
                <h2 className="text-[1.0625rem] font-semibold text-ink-900">Avoirs obtenus par fournisseur</h2>
                <p className="text-meta text-steel-400">Sur les retours clos : avoir reçu ou refusé</p>
              </div>
              <ul className="divide-y divide-rule">
                {taux.map((f) => (
                  <li key={f.id} className="retours-taux">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Vignette nom={f.nom} taille={38} teinte={teinteSerie(f.id)} />
                      <div className="min-w-0">
                        <p className="truncate text-corps font-semibold text-ink-900">{f.nom}</p>
                        <p className="text-meta text-steel-400">
                          {f.total} {pluriel('retour clos', f.total, 'retours clos')}
                        </p>
                      </div>
                    </div>
                    <div>
                      <div className="retours-repartition" aria-hidden="true">
                        {f.recus > 0 && <i style={{ '--c': 'var(--color-ok)', flex: f.recus } as CSSProperties} />}
                        {f.refus > 0 && <i style={{ '--c': 'var(--color-rupture)', flex: f.refus } as CSSProperties} />}
                      </div>
                      <p className="retours-legende">
                        {f.recus > 0 && (
                          <span style={{ '--c': 'var(--color-ok)' } as CSSProperties}>
                            {f.recus} {pluriel('avoir reçu', f.recus, 'avoirs reçus')}
                          </span>
                        )}
                        {f.refus > 0 && (
                          <span style={{ '--c': 'var(--color-rupture)' } as CSSProperties}>
                            {f.refus} {pluriel('refusé', f.refus)}
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="retours-pourcentage" style={{ '--c': couleurTaux(f.pourcentage) } as CSSProperties}>
                      <b>{f.pourcentage} %</b>
                      <span>d’avoirs obtenus</span>
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {clos.length > 0 && (
            <Card>
              <div className="retours-bloc-tete">
                <h2 className="text-[1.0625rem] font-semibold text-ink-900">Retours clos</h2>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <input
                    type="search"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Fournisseur ou produit…"
                    aria-label="Rechercher un fournisseur ou un produit"
                    className="champ h-8 min-w-0 flex-1 rounded-md border border-rule-strong bg-paper px-2.5 text-corps text-ink-900 max-sm:basis-full sm:w-56 sm:flex-none"
                  />
                  <div className="retours-segments" role="group" aria-label="Issue de l’avoir">
                    {FILTRES.map(([cle, libelle]) => (
                      <button key={cle} type="button" aria-pressed={filtre === cle} onClick={() => setFiltre(cle)}>
                        {libelle}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {closVisibles.length === 0 ? (
                <p className="px-5 py-8 text-center text-corps text-steel-500">Aucun retour pour ce filtre.</p>
              ) : (
                <ul className="divide-y divide-rule">
                  {closVisibles.map((r) => {
                    const refuse = r.statutAvoir === 'REFUSE';
                    const fin = dateCloture(r);
                    const duree = joursEntre(new Date(r.createdAt), fin);
                    return (
                      <li key={r.id} className="retours-clos">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Vignette nom={r.fournisseur.nom} taille={38} teinte={teinteSerie(r.fournisseur.id)} />
                          <div className="min-w-0">
                            <p className="truncate text-corps font-semibold text-ink-900">{r.fournisseur.nom}</p>
                            <p className="truncate text-meta text-steel-400">{resumeProduits(r)}</p>
                          </div>
                        </div>
                        <span className="text-corps text-steel-700 max-lg:hidden">
                          {refuse
                            ? `Refusé le ${dateCourte.format(fin)} · passé en pertes`
                            : `Avoir reçu le ${dateCourte.format(fin)} · ${duree <= 0 ? 'le jour même' : `en ${duree} ${pluriel('jour', duree)}`}`}
                        </span>
                        <span className={cn('text-right text-corps font-semibold max-lg:hidden', refuse ? 'text-rupture' : 'text-ink-900')}>
                          {valeurIncomplete(r) && r.valeurTotale === 0 ? '—' : `${montant(r.valeurTotale, valeurIncomplete(r))} GNF`}
                        </span>
                        <span className="text-right">
                          <Badge variant={refuse ? 'rupture' : 'ok'}>{refuse ? 'Refusé' : 'Avoir reçu'}</Badge>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </>
      )}

      {creation && (
        <FormulaireRetourFournisseur
          onFermer={() => setCreation(false)}
          onCree={(r) => {
            setCreation(false);
            setErreur(null);
            setSucces(`Retour enregistré : ${gnf(r.valeurTotale)} sortis du stock, avoir attendu de ${r.fournisseur.nom}.`);
          }}
        />
      )}
    </div>
  );
}

function CarteRetour({
  retour: r,
  jours,
  enCours,
  bloque,
  onAvoir,
}: {
  retour: RetourFournisseur;
  jours: number;
  /** Décision en cours d'envoi pour ce retour, s'il y en a une. */
  enCours: 'RECU' | 'REFUSE' | null;
  bloque: boolean;
  onAvoir: (statut: 'RECU' | 'REFUSE') => void;
}) {
  return (
    <article className="retours-carte">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <p className="text-corps font-semibold text-ink-900">« {r.motif} »</p>
          <p className="truncate text-meta text-steel-400">
            {r.emplacement.nom} · {r.utilisateur.nom}
          </p>
        </div>
        <span className="retours-age" style={{ '--c': couleurAge(jours) } as CSSProperties}>
          {libelleAge(jours)}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {r.mouvements.map((m) => (
          <li key={m.id} className="flex min-w-0 items-center gap-2.5 text-corps">
            <Vignette nom={m.produit.nom} photoUrl={m.produit.photoUrl} taille={28} />
            <span className="min-w-0 flex-1 truncate">
              <b className="font-semibold">{formatNombre(m.quantite)} ×</b> {m.produit.nom}
              {m.lot && <span className="text-meta text-steel-400"> · lot {m.lot.numero}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="retours-carte-bas">
        <p className="font-display text-[1rem] font-semibold text-ink-900">
          {montant(r.valeurTotale, valeurIncomplete(r))}{' '}
          <span className="font-sans text-meta font-medium text-steel-400">
            {valeurIncomplete(r) && r.valeurTotale === 0 ? 'prix d’achat manquant' : 'GNF'}
          </span>
        </p>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            taille="sm"
            className="text-rupture! hover:bg-rupture-wash!"
            loading={enCours === 'REFUSE'}
            disabled={bloque}
            onClick={() => onAvoir('REFUSE')}
          >
            <X className="size-4" aria-hidden="true" />
            Refusé
          </Button>
          <Button
            taille="sm"
            className="retours-bouton-ok bg-ok! enabled:hover:opacity-95"
            loading={enCours === 'RECU'}
            disabled={bloque}
            onClick={() => onAvoir('RECU')}
          >
            <Check className="size-4" aria-hidden="true" />
            Avoir reçu
          </Button>
        </div>
      </div>
    </article>
  );
}
