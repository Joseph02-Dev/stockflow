import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronRight, CircleCheckBig, FileText, Plus, RefreshCw, Truck, type LucideIcon } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { pluriel } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { Card, PageHeader } from '@/components/patterns/Page';
import { EmptyState, ErrorState, LoadingState } from '@/components/patterns/States';
import { Vignette } from '@/components/patterns/Vignette';
import { STATUTS_COMMANDE } from './statutsCommande';
import type { StatutCommande } from './statutsCommande';
import './commandes.css';

interface Commande {
  id: string;
  statut: StatutCommande;
  createdAt: string;
  envoyeeAt: string | null;
  recueAt: string | null;
  fournisseur: { id: string; nom: string };
  emplacement: { nom: string };
  utilisateur: { nom: string };
  /** Brouillon préparé par le réapprovisionnement automatique. */
  automatique?: boolean;
  _count: { lignes: number };
}

interface Fournisseur {
  id: string;
  delaiLivraisonJours: number | null;
}

const JOUR_MS = 86_400_000;
const dateCourte = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** Jours calendaires entre deux instants (minuit local à minuit local). */
function joursEntre(debut: Date, fin: Date): number {
  const a = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate()).getTime();
  const b = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate()).getTime();
  return Math.round((b - a) / JOUR_MS);
}

function ilYa(date: Date, maintenant: Date): string {
  const jours = joursEntre(date, maintenant);
  if (jours <= 0) return 'aujourd’hui';
  if (jours === 1) return 'hier';
  return `il y a ${jours} jours`;
}

/** Où en est une commande envoyée, d'après le délai annoncé par le fournisseur. */
function suivi(commande: Commande, delai: number | null, maintenant: Date) {
  const envoyee = new Date(commande.envoyeeAt ?? commande.createdAt);
  if (delai == null) return { envoyee, prevue: null, progression: null, retard: 0, restant: 0 };
  const prevue = new Date(envoyee.getTime() + delai * JOUR_MS);
  const ecoules = joursEntre(envoyee, maintenant);
  const restant = joursEntre(maintenant, prevue);
  return {
    envoyee,
    prevue,
    progression: delai > 0 ? Math.min(100, Math.max(0, (ecoules / delai) * 100)) : 100,
    retard: Math.max(0, -restant),
    restant,
  };
}

function Etape({
  vers,
  Icone,
  valeur,
  libelle,
  teinte,
  note,
  roule,
}: {
  vers: string;
  Icone: LucideIcon;
  valeur: number;
  libelle: string;
  teinte: string;
  note?: string;
  roule?: boolean;
}) {
  return (
    <a href={vers} className="commandes-etape" style={{ '--teinte': teinte } as CSSProperties}>
      <span className="commandes-rond" data-roule={roule ? '' : undefined} aria-hidden="true">
        <Icone className="size-5" />
      </span>
      <span>
        <span className="block font-display text-[1.625rem] leading-none font-semibold text-ink-900">{valeur}</span>
        <span className="mt-1 block text-corps text-steel-500 max-sm:text-meta">{libelle}</span>
        {note && <span className="mt-0.5 block text-meta font-semibold text-rupture">{note}</span>}
      </span>
    </a>
  );
}

function TeteSection({ id, titre, nombre, meta, action }: { id: string; titre: string; nombre?: number; meta?: string; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex flex-col gap-1 px-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <h2 id={id} className="flex items-center gap-2 text-[1.0625rem] font-semibold text-ink-900">
        {titre}
        {nombre !== undefined && (
          <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full border border-rule bg-entete-tableau px-1.5 text-meta text-steel-500">
            {nombre}
          </span>
        )}
      </h2>
      {meta && <p className="text-meta text-steel-400">{meta}</p>}
      {action}
    </div>
  );
}

type FiltreHistorique = 'TOUTES' | 'RECUE' | 'ANNULEE';

export function CommandesPage() {
  const navigate = useNavigate();
  const [maintenant] = useState(() => new Date());
  const [filtre, setFiltre] = useState<FiltreHistorique>('TOUTES');

  const commandes = useQuery({
    queryKey: ['commandes'],
    queryFn: async () => (await api.get<Commande[]>('/commandes')).data,
  });
  // Délai annoncé par chaque fournisseur : cache partagé avec Fournisseurs et Alertes.
  const fournisseurs = useQuery({
    queryKey: ['fournisseurs'],
    queryFn: async () => (await api.get<Fournisseur[]>('/fournisseurs')).data,
  });
  const delais = new Map((fournisseurs.data ?? []).map((f) => [f.id, f.delaiLivraisonJours]));

  const toutes = commandes.data ?? [];
  const brouillons = toutes.filter((c) => c.statut === 'BROUILLON');
  const enRoute = toutes
    .filter((c) => c.statut === 'ENVOYEE')
    .map((c) => ({ commande: c, ...suivi(c, delais.get(c.fournisseur.id) ?? null, maintenant) }))
    // Les plus en retard d'abord, puis celles qui arrivent le plus tôt.
    .sort((a, b) => b.retard - a.retard || (a.prevue?.getTime() ?? Infinity) - (b.prevue?.getTime() ?? Infinity));
  const historique = toutes.filter((c) => c.statut === 'RECUE' || c.statut === 'ANNULEE');
  const enRetard = enRoute.filter((r) => r.retard > 0).length;
  const recuesCeMois = historique.filter((c) => {
    if (!c.recueAt) return false;
    const d = new Date(c.recueAt);
    return d.getFullYear() === maintenant.getFullYear() && d.getMonth() === maintenant.getMonth();
  }).length;
  const historiqueVisible = historique.filter((c) => filtre === 'TOUTES' || c.statut === filtre);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Commandes fournisseur"
        description="De la préparation à la réception en dépôt."
        action={
          <Button onClick={() => navigate('/commandes/nouvelle')}>
            <Plus className="size-4" aria-hidden="true" />
            Nouvelle commande
          </Button>
        }
      />

      {commandes.isLoading ? (
        <LoadingState />
      ) : commandes.isError ? (
        <Card>
          <ErrorState message={messageErreur(commandes.error)} onRetry={() => commandes.refetch()} />
        </Card>
      ) : toutes.length === 0 ? (
        <Card>
          <EmptyState
            titre="Aucune commande"
            description="Créez un bon de commande manuellement, ou depuis l’écran « Ce qui manque »."
            action={<Button onClick={() => navigate('/commandes/nouvelle')}>Nouvelle commande</Button>}
          />
        </Card>
      ) : (
        <>
          {/* Parcours d'une commande : chaque étape mène à sa section. */}
          <nav aria-label="Étapes des commandes" className="grid grid-cols-3 gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:gap-2.5">
            <Etape vers="#a-envoyer" Icone={FileText} valeur={brouillons.length} libelle="À envoyer" teinte="var(--color-steel-500)" />
            <ArrowRight className="hidden size-5 self-center text-rule-strong sm:block" aria-hidden="true" />
            <Etape
              vers="#en-route"
              Icone={Truck}
              valeur={enRoute.length}
              libelle="En route"
              teinte="var(--color-action)"
              note={enRetard > 0 ? `${enRetard} en retard` : undefined}
              roule={enRoute.length > 0}
            />
            <ArrowRight className="hidden size-5 self-center text-rule-strong sm:block" aria-hidden="true" />
            <Etape
              vers="#historique"
              Icone={CircleCheckBig}
              valeur={recuesCeMois}
              libelle={pluriel('Reçue ce mois-ci', recuesCeMois, 'Reçues ce mois-ci')}
              teinte="var(--color-ok)"
            />
          </nav>

          {brouillons.length > 0 && (
            <section aria-labelledby="a-envoyer" className="scroll-mt-20">
              <TeteSection id="a-envoyer" titre="À envoyer" nombre={brouillons.length} meta="Brouillons prêts à partir chez le fournisseur" />
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {brouillons.map((c) => (
                  <li key={c.id} className="commandes-brouillon">
                    <div className="flex items-center gap-3">
                      <Vignette nom={c.fournisseur.nom} taille={42} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-corps font-semibold text-ink-900">{c.fournisseur.nom}</p>
                        <p className="truncate text-meta text-steel-400">
                          Préparée {ilYa(new Date(c.createdAt), maintenant)} par {c.utilisateur.nom}
                        </p>
                      </div>
                      {c.automatique && (
                        <Badge variant="accent">
                          <RefreshCw className="size-3" aria-hidden="true" />
                          Auto
                        </Badge>
                      )}
                    </div>
                    <dl className="flex gap-4 text-meta text-steel-500">
                      <div className="flex flex-col-reverse">
                        <dt>{pluriel('référence', c._count.lignes)}</dt>
                        <dd className="font-display text-[1.125rem] font-semibold text-ink-900">{c._count.lignes}</dd>
                      </div>
                      <div className="flex min-w-0 flex-col-reverse">
                        <dt>livraison</dt>
                        <dd className="truncate font-display text-[1.125rem] font-semibold text-ink-900">{c.emplacement.nom}</dd>
                      </div>
                    </dl>
                    <Link to={`/commandes/${c.id}`} className={boutonClasses('secondary', 'mt-auto w-full', { taille: 'sm' })}>
                      Vérifier et envoyer →
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {enRoute.length > 0 && (
            <section aria-labelledby="en-route" className="scroll-mt-20">
              <TeteSection
                id="en-route"
                titre="En route"
                nombre={enRoute.length}
                meta="Arrivée estimée d’après le délai annoncé par le fournisseur"
              />
              <Card>
                <ul className="divide-y divide-rule">
                  {enRoute.map(({ commande: c, envoyee, prevue, progression, retard, restant }) => {
                    const couleur = retard > 0 ? 'var(--color-rupture)' : prevue ? 'var(--color-action)' : 'var(--color-steel-400)';
                    const etat =
                      retard > 0
                        ? `En retard de ${retard} ${pluriel('jour', retard)}`
                        : !prevue
                          ? 'Délai non renseigné par le fournisseur'
                          : restant === 0
                            ? 'Arrivée prévue aujourd’hui'
                            : restant === 1
                              ? 'Arrivée prévue demain'
                              : `Arrivée prévue dans ${restant} jours`;
                    return (
                      <li key={c.id} className="commandes-route">
                        <Vignette nom={c.fournisseur.nom} taille={42} />
                        <div className="min-w-0">
                          <p className="truncate text-corps font-semibold text-ink-900">{c.fournisseur.nom}</p>
                          <p className="truncate text-meta text-steel-400">
                            {c._count.lignes} {pluriel('référence', c._count.lignes)} pour {c.emplacement.nom}
                          </p>
                        </div>
                        <div style={{ '--c': couleur } as CSSProperties}>
                          <p className="mb-1.5 flex justify-between gap-2 text-meta text-steel-400">
                            <span>
                              Envoyée le <span className="font-semibold text-ink-900">{dateCourte.format(envoyee)}</span>
                            </span>
                            <span>
                              {prevue ? (
                                <>
                                  Prévue le <span className="font-semibold text-ink-900">{dateCourte.format(prevue)}</span>
                                </>
                              ) : (
                                '—'
                              )}
                            </span>
                          </p>
                          <div className="commandes-piste relative h-2 rounded-full bg-rule" aria-hidden="true">
                            {progression !== null && (
                              <>
                                <i className="absolute inset-y-0 left-0 rounded-full bg-(--c)" style={{ width: `${progression}%` }} />
                                <span
                                  className="absolute top-1/2 grid size-[22px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface text-(--c) ring-2 ring-(--c)"
                                  style={{ left: `clamp(11px, ${progression}%, calc(100% - 11px))` }}
                                >
                                  <Truck className="size-[13px]" />
                                </span>
                              </>
                            )}
                          </div>
                          <p className="mt-1.5 text-meta font-semibold text-(--c)">{etat}</p>
                        </div>
                        <Link
                          to={`/commandes/${c.id}`}
                          className={boutonClasses(retard > 0 ? 'primary' : 'secondary', undefined, { taille: 'sm' })}
                        >
                          Réceptionner
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          )}

          {historique.length > 0 && (
            <section aria-labelledby="historique" className="scroll-mt-20">
              <TeteSection
                id="historique"
                titre="Historique"
                action={
                  <div className="inline-flex self-start rounded-[10px] border border-rule bg-entete-tableau p-[3px]" role="group" aria-label="Statut">
                    {(
                      [
                        ['TOUTES', 'Toutes'],
                        ['RECUE', 'Reçues'],
                        ['ANNULEE', 'Annulées'],
                      ] as const
                    ).map(([cle, libelle]) => (
                      <button
                        key={cle}
                        type="button"
                        aria-pressed={filtre === cle}
                        onClick={() => setFiltre(cle)}
                        className="h-[30px] rounded-[7px] px-3 text-meta font-semibold text-steel-500 aria-pressed:bg-surface aria-pressed:text-ink-900 aria-pressed:shadow-card"
                      >
                        {libelle}
                      </button>
                    ))}
                  </div>
                }
              />
              <Card>
                {historiqueVisible.length === 0 ? (
                  <p className="px-5 py-8 text-center text-corps text-steel-500">Aucune commande pour ce filtre.</p>
                ) : (
                  <ul className="divide-y divide-rule">
                    {historiqueVisible.map((c) => {
                      const statut = STATUTS_COMMANDE[c.statut];
                      const recue = c.recueAt ? new Date(c.recueAt) : null;
                      const duree = recue && c.envoyeeAt ? joursEntre(new Date(c.envoyeeAt), recue) : null;
                      return (
                        <li key={c.id}>
                          <Link to={`/commandes/${c.id}`} className="commandes-historique group">
                            <Vignette nom={c.fournisseur.nom} taille={36} />
                            <span className="min-w-0">
                              <span className="block truncate text-corps font-semibold text-ink-900">{c.fournisseur.nom}</span>
                              <span className="block text-meta text-steel-400">
                                {c._count.lignes} {pluriel('référence', c._count.lignes)}
                              </span>
                            </span>
                            <span className="text-corps text-steel-700">
                              {recue ? `Reçue le ${dateCourte.format(recue)}` : `Créée le ${dateCourte.format(new Date(c.createdAt))}`}
                            </span>
                            <span className="text-corps text-steel-700">
                              {duree === null ? '—' : duree === 0 ? 'Livrée le jour même' : `Livrée en ${duree} ${pluriel('jour', duree)}`}
                            </span>
                            <span>
                              <Badge variant={statut.variant}>{statut.libelle}</Badge>
                            </span>
                            <ChevronRight
                              className="size-4 text-steel-400 transition-transform duration-200 ease-sortie group-hover:translate-x-0.5"
                              aria-hidden="true"
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}
