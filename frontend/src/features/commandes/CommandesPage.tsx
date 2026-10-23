import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, CircleCheckBig, FileText, Plus, RefreshCw, Send, Truck, type LucideIcon } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { formatCompact, formatNombre, pluriel } from '@/lib/format';
import { cn } from '@/lib/cn';
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
  /** Quantités × prix d'achat actuel (aucun prix n'est figé sur la commande). */
  valeurEstimee: number;
  /** Un produit au moins n'a pas de prix d'achat : valeur sous-estimée. */
  valeurIncomplete: boolean;
}

interface Fournisseur {
  id: string;
  delaiLivraisonJours: number | null;
}

const JOUR_MS = 86_400_000;
const dateCourte = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const TEINTES = ['var(--color-serie-1)', 'var(--color-serie-2)', 'var(--color-serie-3)', 'var(--color-serie-4)', 'var(--color-serie-5)'];

/** Couleur stable d'un fournisseur, pour le reconnaître d'une section à l'autre. */
function teinte(id: string): string {
  let somme = 0;
  for (const c of id) somme = (somme * 31 + c.charCodeAt(0)) >>> 0;
  return TEINTES[somme % TEINTES.length];
}

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

function jours(valeur: number): string {
  return `${formatNombre(Math.round(valeur * 10) / 10)} j`;
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

/** Durée réelle d'une commande reçue, et écart au délai annoncé (positif = retard). */
function livraison(commande: Commande, delai: number | null) {
  if (!commande.recueAt || !commande.envoyeeAt) return null;
  const duree = joursEntre(new Date(commande.envoyeeAt), new Date(commande.recueAt));
  return { duree, ecart: delai == null ? null : duree - delai };
}

function libelleEcart(ecart: number | null): { texte: string; teinte: string } {
  if (ecart === null) return { texte: '—', teinte: 'var(--color-steel-400)' };
  if (ecart <= 0) return { texte: 'À l’heure', teinte: 'var(--color-ok)' };
  return { texte: `+${ecart} j`, teinte: ecart > 1 ? 'var(--color-rupture)' : 'var(--color-faible)' };
}

type Colonne = 'envoyer' | 'route' | 'recues';
type FiltreHistorique = 'TOUTES' | 'RECUE' | 'ANNULEE';

export function CommandesPage() {
  const navigate = useNavigate();
  const [maintenant] = useState(() => new Date());
  const [filtre, setFiltre] = useState<FiltreHistorique>('TOUTES');
  const [recherche, setRecherche] = useState('');
  const [colonne, setColonne] = useState<Colonne | null>(null);

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
  const delaiDe = (c: Commande) => delais.get(c.fournisseur.id) ?? null;

  const toutes = commandes.data ?? [];
  const brouillons = toutes.filter((c) => c.statut === 'BROUILLON');
  const enRoute = toutes
    .filter((c) => c.statut === 'ENVOYEE')
    .map((c) => ({ commande: c, ...suivi(c, delaiDe(c), maintenant) }))
    // Les plus en retard d'abord, puis celles qui arrivent le plus tôt.
    .sort((a, b) => b.retard - a.retard || (a.prevue?.getTime() ?? Infinity) - (b.prevue?.getTime() ?? Infinity));
  const recues = toutes
    .filter((c) => c.statut === 'RECUE' && c.recueAt)
    .sort((a, b) => new Date(b.recueAt!).getTime() - new Date(a.recueAt!).getTime());
  const historique = toutes.filter((c) => c.statut === 'RECUE' || c.statut === 'ANNULEE');
  const enRetard = enRoute.filter((r) => r.retard > 0).length;
  const recuesCeMois = recues.filter((c) => {
    const d = new Date(c.recueAt!);
    return d.getFullYear() === maintenant.getFullYear() && d.getMonth() === maintenant.getMonth();
  }).length;

  const ouvertes = [...brouillons, ...enRoute.map((r) => r.commande)];
  const valeurOuverte = ouvertes.reduce((a, c) => a + c.valeurEstimee, 0);
  const valeurIncomplete = ouvertes.some((c) => c.valeurIncomplete);
  const referencesOuvertes = ouvertes.reduce((a, c) => a + c._count.lignes, 0);

  // Fiabilité : délai réellement constaté sur les commandes reçues, par fournisseur.
  const parFournisseur = new Map<string, { id: string; nom: string; durees: number[]; aLHeure: number; delai: number | null }>();
  for (const c of recues) {
    const l = livraison(c, delaiDe(c));
    if (!l) continue;
    const f = parFournisseur.get(c.fournisseur.id) ?? { id: c.fournisseur.id, nom: c.fournisseur.nom, durees: [], aLHeure: 0, delai: delaiDe(c) };
    f.durees.push(l.duree);
    if (l.ecart !== null && l.ecart <= 0) f.aLHeure += 1;
    parFournisseur.set(c.fournisseur.id, f);
  }
  const fiabilite = [...parFournisseur.values()]
    .map((f) => ({ ...f, moyenne: f.durees.reduce((a, d) => a + d, 0) / f.durees.length }))
    .sort((a, b) => b.durees.length - a.durees.length);
  const echelle = Math.max(1, ...fiabilite.flatMap((f) => [f.moyenne, f.delai ?? 0]));
  const moyenneDe = (fournisseurId: string) => fiabilite.find((f) => f.id === fournisseurId)?.moyenne ?? null;

  const prochaine = enRoute.find((r) => r.prevue) ?? enRoute[0];
  const terme = recherche.trim().toLocaleLowerCase('fr');
  const historiqueVisible = historique.filter(
    (c) => (filtre === 'TOUTES' || c.statut === filtre) && (!terme || c.fournisseur.nom.toLocaleLowerCase('fr').includes(terme)),
  );
  // Téléphone : une colonne à la fois, celle des commandes en route par défaut.
  const colonneActive: Colonne = colonne ?? (enRoute.length > 0 ? 'route' : brouillons.length > 0 ? 'envoyer' : 'recues');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titre="Commandes fournisseur"
        description="De la préparation à la réception en dépôt, et la fiabilité de chaque fournisseur."
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
          <section className="commandes-bandeau" aria-label="Résumé des commandes">
            <div>
              <p className="commandes-sur">En commande en ce moment</p>
              <p className="mt-1.5 font-display text-[2.25rem] leading-tight font-semibold tracking-[-0.02em] max-sm:text-[1.875rem]">
                {valeurIncomplete && valeurOuverte > 0 && <span className="text-[1.125rem] font-medium text-white/60">au moins </span>}
                {formatNombre(valeurOuverte)} <span className="font-sans text-[0.95rem] font-semibold text-white/60">GNF estimés</span>
              </p>
              <p className="text-corps text-white/65">
                {ouvertes.length} {pluriel('commande ouverte', ouvertes.length, 'commandes ouvertes')} · {referencesOuvertes}{' '}
                {pluriel('référence', referencesOuvertes)} · au prix d’achat actuel
                {valeurIncomplete && ' (des produits n’ont pas de prix d’achat)'}
              </p>
              <div className="mt-3.5 flex flex-wrap gap-2">
                <Puce teinte="#a0a3ab" texte={`${brouillons.length} à envoyer`} />
                <Puce teinte="#f27a35" texte={`${enRoute.length} en route`} />
                {enRetard > 0 && <Puce teinte="#f0705f" texte={`${enRetard} en retard`} />}
                <Puce teinte="#3ebe94" texte={`${recuesCeMois} ${pluriel('reçue', recuesCeMois)} ce mois`} />
              </div>
            </div>
            <div className="commandes-prochaine">
              {prochaine ? (
                <>
                  <p className="commandes-sur">{prochaine.retard > 0 ? 'Arrivée attendue' : 'Prochaine arrivée'}</p>
                  <p className="text-[1rem] font-semibold">
                    {prochaine.commande.fournisseur.nom} ·{' '}
                    {prochaine.retard > 0
                      ? `${prochaine.retard} ${pluriel('jour', prochaine.retard)} de retard`
                      : !prochaine.prevue
                        ? 'date inconnue'
                        : prochaine.restant <= 0
                          ? 'aujourd’hui'
                          : prochaine.restant === 1
                            ? 'demain'
                            : `dans ${prochaine.restant} jours`}
                  </p>
                  <p className="flex items-center gap-2.5 text-meta text-white/70">
                    <Truck className="size-[15px] shrink-0" aria-hidden="true" />
                    {prochaine.commande._count.lignes} {pluriel('référence', prochaine.commande._count.lignes)} pour{' '}
                    {prochaine.commande.emplacement.nom} · envoyée le {dateCourte.format(prochaine.envoyee)}
                  </p>
                  <p className="flex items-center gap-2.5 text-meta text-white/70">
                    <CalendarDays className="size-[15px] shrink-0" aria-hidden="true" />
                    {delaiDe(prochaine.commande) == null
                      ? 'Délai non renseigné par le fournisseur'
                      : `Délai annoncé ${delaiDe(prochaine.commande)} jours`}
                    {moyenneDe(prochaine.commande.fournisseur.id) !== null &&
                      ` · réel moyen ${jours(moyenneDe(prochaine.commande.fournisseur.id)!)}`}
                  </p>
                  <Link to={`/commandes/${prochaine.commande.id}`} className="commandes-lien-clair">
                    Préparer la réception →
                  </Link>
                </>
              ) : (
                <>
                  <p className="commandes-sur">Prochaine arrivée</p>
                  <p className="text-[1rem] font-semibold">Aucune commande en route</p>
                  <p className="text-meta text-white/70">Ce qui manque en stock est regroupé par fournisseur, prêt à commander.</p>
                  <Link to="/alertes" className="commandes-lien-clair">
                    Voir ce qui manque →
                  </Link>
                </>
              )}
            </div>
          </section>

          <div className="commandes-selecteur md:hidden" role="group" aria-label="Étape">
            {(
              [
                ['envoyer', `À envoyer · ${brouillons.length}`],
                ['route', `En route · ${enRoute.length}`],
                ['recues', `Reçues · ${recues.length}`],
              ] as const
            ).map(([cle, libelle]) => (
              <button key={cle} type="button" aria-pressed={colonneActive === cle} onClick={() => setColonne(cle)}>
                {libelle}
              </button>
            ))}
          </div>

          <div className="commandes-colonnes">
            <section className="commandes-colonne" data-active={colonneActive === 'envoyer' || undefined} aria-labelledby="a-envoyer">
              <TeteColonne id="a-envoyer" Icone={FileText} titre="À envoyer" nombre={brouillons.length} teinte="var(--color-steel-500)" />
              {brouillons.length === 0 && <p className="commandes-vide">Aucun brouillon en attente.</p>}
              {brouillons.map((c) => (
                <article key={c.id} className="commandes-carte">
                  <Fournisseur commande={c} sousTitre={`Préparée ${ilYa(new Date(c.createdAt), maintenant)} par ${c.utilisateur.nom}`}>
                    {c.automatique && (
                      <Badge variant="accent">
                        <RefreshCw className="size-3" aria-hidden="true" />
                        Auto
                      </Badge>
                    )}
                  </Fournisseur>
                  <dl className="commandes-chiffres">
                    <div>
                      <dt>{pluriel('référence', c._count.lignes)}</dt>
                      <dd>{c._count.lignes}</dd>
                    </div>
                    <div>
                      <dt>GNF estimés</dt>
                      <dd>{c.valeurEstimee > 0 ? formatCompact(c.valeurEstimee) : '—'}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt>livraison</dt>
                      <dd className="truncate">{c.emplacement.nom}</dd>
                    </div>
                  </dl>
                  <Link to={`/commandes/${c.id}`} className={boutonClasses('secondary', 'w-full', { taille: 'sm' })}>
                    <Send className="size-4" aria-hidden="true" />
                    Vérifier et envoyer
                  </Link>
                </article>
              ))}
            </section>

            <section className="commandes-colonne" data-active={colonneActive === 'route' || undefined} aria-labelledby="en-route">
              <TeteColonne id="en-route" Icone={Truck} titre="En route" nombre={enRoute.length} teinte="var(--color-action)" />
              {enRoute.length === 0 && <p className="commandes-vide">Aucune commande en route.</p>}
              {enRoute.map(({ commande: c, envoyee, prevue, progression, retard, restant }) => {
                const couleur = retard > 0 ? 'var(--color-rupture)' : prevue ? 'var(--color-action)' : 'var(--color-steel-400)';
                const etat =
                  retard > 0
                    ? `En retard de ${retard} ${pluriel('jour', retard)}`
                    : !prevue
                      ? 'Délai non renseigné'
                      : restant <= 0
                        ? 'Arrivée prévue aujourd’hui'
                        : restant === 1
                          ? 'Arrivée prévue demain'
                          : `Arrivée prévue dans ${restant} jours`;
                return (
                  <article
                    key={c.id}
                    className={cn('commandes-carte', retard > 0 && 'commandes-carte-retard')}
                    style={{ '--c': couleur } as CSSProperties}
                  >
                    <Fournisseur commande={c} sousTitre={`${c._count.lignes} ${pluriel('référence', c._count.lignes)} · ${c.emplacement.nom}`}>
                      {retard > 0 && <Badge variant="rupture">+{retard} j de retard</Badge>}
                    </Fournisseur>
                    <div>
                      {progression !== null && (
                        <div className="commandes-piste" aria-hidden="true">
                          <i style={{ width: `${progression}%` }} />
                          <span style={{ left: `clamp(12px, ${progression}%, calc(100% - 12px))` }}>
                            <Truck className="size-[13px]" />
                          </span>
                        </div>
                      )}
                      <p className="commandes-dates">
                        <span>
                          Envoyée le <b>{dateCourte.format(envoyee)}</b>
                        </span>
                        <span>{prevue ? <>Prévue le <b>{dateCourte.format(prevue)}</b></> : '—'}</span>
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-meta font-semibold text-(--c)">{etat}</span>
                      <Link to={`/commandes/${c.id}`} className={boutonClasses(retard > 0 ? 'primary' : 'secondary', undefined, { taille: 'sm' })}>
                        Réceptionner
                      </Link>
                    </div>
                  </article>
                );
              })}
            </section>

            <section className="commandes-colonne" data-active={colonneActive === 'recues' || undefined} aria-labelledby="recues">
              <TeteColonne id="recues" Icone={CircleCheckBig} titre="Reçues récemment" nombre={recues.length} teinte="var(--color-ok)" />
              {recues.length === 0 && <p className="commandes-vide">Aucune commande reçue pour l’instant.</p>}
              {recues.slice(0, 4).map((c) => {
                const l = livraison(c, delaiDe(c));
                const ecart = libelleEcart(l?.ecart ?? null);
                return (
                  <Link key={c.id} to={`/commandes/${c.id}`} className="commandes-recue">
                    <Fournisseur
                      commande={c}
                      sousTitre={`Reçue le ${dateCourte.format(new Date(c.recueAt!))}${!l ? '' : l.duree === 0 ? ' · le jour même' : ` · en ${l.duree} ${pluriel('jour', l.duree)}`}`}
                    >
                      {l?.ecart != null && (
                        <span className="commandes-ecart" style={{ '--c': ecart.teinte } as CSSProperties}>
                          {ecart.texte}
                        </span>
                      )}
                    </Fournisseur>
                  </Link>
                );
              })}
              {historique.length > 0 && (
                <a href="#historique" className="self-center px-1.5 py-1 text-corps font-semibold text-action">
                  Tout l’historique ↓
                </a>
              )}
            </section>
          </div>

          {fiabilite.length > 0 && (
            <Card>
              <div className="commandes-bloc-tete">
                <h2 className="text-[1.0625rem] font-semibold text-ink-900">Fiabilité des fournisseurs</h2>
                <p className="text-meta text-steel-400">Délai annoncé et délai réellement constaté, sur les commandes reçues</p>
              </div>
              <ul className="divide-y divide-rule">
                {fiabilite.map((f) => {
                  const ponctualite = f.delai == null ? null : Math.round((f.aLHeure / f.durees.length) * 100);
                  const couleur =
                    ponctualite === null
                      ? 'var(--color-steel-400)'
                      : ponctualite >= 80
                        ? 'var(--color-ok)'
                        : ponctualite >= 50
                          ? 'var(--color-faible)'
                          : 'var(--color-rupture)';
                  return (
                    <li key={f.id} className="commandes-fiabilite">
                      <div className="flex min-w-0 items-center gap-3">
                        <Vignette nom={f.nom} taille={38} teinte={teinte(f.id)} />
                        <div className="min-w-0">
                          <p className="truncate text-corps font-semibold text-ink-900">{f.nom}</p>
                          <p className="text-meta text-steel-400">
                            {f.durees.length} {pluriel('commande reçue', f.durees.length, 'commandes reçues')}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 text-meta text-steel-400">
                        <Barre libelle="Annoncé" valeur={f.delai} echelle={echelle} teinte="var(--color-rule-strong)" />
                        <Barre
                          libelle="Réel moyen"
                          valeur={f.moyenne}
                          echelle={echelle}
                          teinte={f.delai != null && f.moyenne > f.delai ? 'var(--color-rupture)' : 'var(--color-ok)'}
                        />
                      </div>
                      <p className="commandes-ponctualite" style={{ '--c': couleur } as CSSProperties}>
                        <b>{ponctualite === null ? '—' : `${ponctualite} %`}</b>
                        <span>{ponctualite === null ? 'délai non renseigné' : 'à l’heure'}</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {historique.length > 0 && (
            <section id="historique" aria-labelledby="titre-historique" className="scroll-mt-20">
              <Card>
                <div className="commandes-bloc-tete">
                  <h2 id="titre-historique" className="text-[1.0625rem] font-semibold text-ink-900">
                    Historique
                  </h2>
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <input
                      type="search"
                      value={recherche}
                      onChange={(e) => setRecherche(e.target.value)}
                      placeholder="Fournisseur…"
                      aria-label="Rechercher un fournisseur"
                      className="champ h-8 min-w-0 flex-1 rounded-md border border-rule-strong bg-paper px-2.5 text-corps text-ink-900 sm:w-56 sm:flex-none"
                    />
                    <div className="commandes-segments" role="group" aria-label="Statut">
                      {(
                        [
                          ['TOUTES', 'Toutes'],
                          ['RECUE', 'Reçues'],
                          ['ANNULEE', 'Annulées'],
                        ] as const
                      ).map(([cle, libelle]) => (
                        <button key={cle} type="button" aria-pressed={filtre === cle} onClick={() => setFiltre(cle)}>
                          {libelle}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {historiqueVisible.length === 0 ? (
                  <p className="px-5 py-8 text-center text-corps text-steel-500">Aucune commande pour ce filtre.</p>
                ) : (
                  <ul className="divide-y divide-rule">
                    {historiqueVisible.map((c) => {
                      const statut = STATUTS_COMMANDE[c.statut];
                      const l = livraison(c, delaiDe(c));
                      const ecart = libelleEcart(l?.ecart ?? null);
                      const date = c.recueAt
                        ? `Reçue le ${dateCourte.format(new Date(c.recueAt))}`
                        : `Créée le ${dateCourte.format(new Date(c.createdAt))}`;
                      return (
                        <li key={c.id}>
                          <Link to={`/commandes/${c.id}`} className="commandes-historique group">
                            <Fournisseur commande={c} sousTitre={`${c._count.lignes} ${pluriel('référence', c._count.lignes)} · ${date}`} />
                            <span className="text-corps text-steel-700 max-lg:hidden">
                              {l === null ? '—' : l.duree === 0 ? 'Livrée le jour même' : `En ${l.duree} ${pluriel('jour', l.duree)}`}
                            </span>
                            <span className="text-corps font-semibold max-lg:hidden" style={{ color: ecart.teinte }}>
                              {ecart.texte}
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

function Puce({ teinte: couleur, texte }: { teinte: string; texte: string }) {
  return (
    <span className="commandes-puce">
      <i style={{ background: couleur }} aria-hidden="true" />
      {texte}
    </span>
  );
}

function TeteColonne({ id, Icone, titre, nombre, teinte: couleur }: { id: string; Icone: LucideIcon; titre: string; nombre: number; teinte: string }) {
  return (
    <div className="commandes-colonne-tete" style={{ '--c': couleur } as CSSProperties}>
      <span className="commandes-pastille" aria-hidden="true">
        <Icone className="size-4" />
      </span>
      <h2 id={id} className="text-[0.9375rem] font-semibold text-ink-900">
        {titre}
      </h2>
      <span className="commandes-nombre">{nombre}</span>
    </div>
  );
}

function Fournisseur({ commande, sousTitre, children }: { commande: Commande; sousTitre: string; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Vignette nom={commande.fournisseur.nom} taille={38} teinte={teinte(commande.fournisseur.id)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-corps font-semibold text-ink-900">{commande.fournisseur.nom}</p>
        <p className="truncate text-meta text-steel-400">{sousTitre}</p>
      </div>
      {children}
    </div>
  );
}

function Barre({ libelle, valeur, echelle, teinte: couleur }: { libelle: string; valeur: number | null; echelle: number; teinte: string }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_48px] items-center gap-2">
      <span>{libelle}</span>
      <span className="commandes-barre">
        {valeur !== null && <i style={{ width: `${(valeur / echelle) * 100}%`, background: couleur }} />}
      </span>
      <b className="text-right font-semibold text-ink-900">{valeur === null ? '—' : jours(valeur)}</b>
    </div>
  );
}
