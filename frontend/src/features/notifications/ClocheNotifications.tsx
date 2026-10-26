import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarX,
  CheckCheck,
  PackageX,
  ShoppingCart,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNombre, pluriel, tempsRelatif } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { datePeremption } from '@/features/peremptions/presentation';
import { ActivationPush } from './ActivationPush';

type Niveau = 'CRITIQUE' | 'AVERTISSEMENT' | 'INFO';
type TypeNotification = 'RUPTURE' | 'STOCK_FAIBLE' | 'LOT_PERIME' | 'LOT_BIENTOT_PERIME' | 'LOT_A_SURVEILLER' | 'BIENVENUE';

interface Notification {
  cle: string;
  niveau: Niveau;
  type: TypeNotification;
  date: string;
  lue: boolean;
  /** Absent du seul message de bienvenue. */
  produit?: { id: string; nom: string; reference: string | null; uniteMesure: string | null };
  bienvenue?: { nom: string; entreprise: string; role: 'ADMIN' | 'GESTIONNAIRE'; createur: boolean };
  stock?: { actuel: number; seuil: number };
  lot?: { id: string; numero: string; quantite: number; joursRestants: number; valeur: number; emplacement: string };
}

interface ReponseNotifications {
  notifications: Notification[];
  nonLues: number;
}

// Sous la clé « alertes » : tout ce qui invalide les alertes (mouvement,
// vente, sortie de lot, synchronisation) rafraîchit aussi la cloche.
const CLE = ['alertes', 'notifications'];

const FILTRES: { cle: Niveau | 'TOUT'; libelle: string }[] = [
  { cle: 'TOUT', libelle: 'Tout' },
  { cle: 'CRITIQUE', libelle: 'Critique' },
  { cle: 'AVERTISSEMENT', libelle: 'Avertissement' },
  { cle: 'INFO', libelle: 'Info' },
];

const STYLE_NIVEAU: Record<Niveau, { texte: string; fond: string; point: string }> = {
  CRITIQUE: { texte: 'text-rupture', fond: 'bg-rupture-wash', point: 'bg-rupture' },
  AVERTISSEMENT: { texte: 'text-faible', fond: 'bg-faible-wash', point: 'bg-faible' },
  INFO: { texte: 'text-action', fond: 'bg-action-wash', point: 'bg-action' },
};

const PRESENTATION: Record<TypeNotification, { genre: string; Icone: LucideIcon }> = {
  RUPTURE: { genre: 'Rupture de stock', Icone: PackageX },
  STOCK_FAIBLE: { genre: 'Stock faible', Icone: TriangleAlert },
  LOT_PERIME: { genre: 'Lot périmé', Icone: CalendarX },
  LOT_BIENTOT_PERIME: { genre: 'Péremption proche', Icone: CalendarClock },
  LOT_A_SURVEILLER: { genre: 'À surveiller', Icone: CalendarClock },
  BIENVENUE: { genre: 'Bienvenue', Icone: Sparkles },
};

/** Premiers pas proposés dans la bienvenue : configurer (créateur) ou travailler (personne invitée). */
function premiersPas(b: NonNullable<Notification['bienvenue']>): { libelle: string; chemin: string }[] {
  return b.createur
    ? [
        { libelle: 'Ajouter un produit', chemin: '/produits/nouveau' },
        { libelle: 'Mes emplacements', chemin: '/emplacements' },
        { libelle: 'Inviter l’équipe', chemin: '/parametres?onglet=utilisateurs' },
      ]
    : [
        { libelle: 'Voir le stock', chemin: '/stock' },
        { libelle: 'Nouvelle vente', chemin: '/ventes/nouvelle' },
      ];
}

function quantite(n: number, unite: string | null) {
  return `${formatNombre(n)} ${unite ?? pluriel('unité', n)}`;
}

function phrase(n: Notification): string {
  if (n.bienvenue) {
    return n.bienvenue.createur
      ? `votre espace ${n.bienvenue.entreprise} est prêt. Voici les premiers pas.`
      : `vous avez rejoint ${n.bienvenue.entreprise}. Voici l’essentiel pour démarrer.`;
  }
  if (n.type === 'RUPTURE') return 'est en rupture.';
  if (n.type === 'STOCK_FAIBLE') return `passe sous le seuil (${quantite(n.stock?.actuel ?? 0, n.produit?.uniteMesure ?? null)}).`;
  const jours = n.lot?.joursRestants ?? 0;
  if (jours < 0) return `· lot ${n.lot?.numero} périmé.`;
  if (jours === 0) return 'expire aujourd’hui.';
  if (jours === 1) return 'expire demain.';
  return `expire dans ${jours} jours.`;
}

function quand(n: Notification, maintenant: number): string {
  if (!n.lot) return tempsRelatif(n.date, maintenant);
  return `${n.lot.joursRestants < 0 ? 'Périmé' : 'Expire'} le ${datePeremption(n.date)}`;
}

/**
 * Cloche de l'en-tête et son panneau : alertes de stock et lots à
 * surveiller, lus sur place. Cliquer une notification la marque comme
 * lue et déplie son détail, sans quitter la page ; seuls les boutons
 * d'action du détail mènent ailleurs.
 */
export function ClocheNotifications() {
  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState<Niveau | 'TOUT'>('TOUT');
  const [deplie, setDeplie] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ton: 'succes' | 'erreur'; texte: string } | null>(null);
  const racine = useRef<HTMLDivElement>(null);
  const cloche = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const requete = useQuery({
    queryKey: CLE,
    queryFn: async () => (await api.get<ReponseNotifications>('/notifications')).data,
    staleTime: 60_000,
  });
  const notifications = requete.data?.notifications ?? [];
  const nonLues = requete.data?.nonLues ?? 0;

  const marquer = useMutation({
    mutationFn: async (cles: string[]) => api.post('/notifications/lues', { cles }),
    // Affichage immédiat ; le serveur confirme en arrière-plan.
    onMutate: (cles) => {
      const lues = new Set(cles);
      queryClient.setQueryData<ReponseNotifications>(CLE, (avant) => {
        if (!avant) return avant;
        const liste = avant.notifications.map((n) => (lues.has(n.cle) ? { ...n, lue: true } : n));
        return { notifications: liste, nonLues: liste.filter((n) => !n.lue).length };
      });
    },
    onError: () => queryClient.invalidateQueries({ queryKey: CLE }),
  });

  const sortirLot = useMutation({
    mutationFn: async (n: Notification) => api.post(`/peremptions/lots/${n.lot!.id}/sortir`),
    onSuccess: (_, n) => {
      setMessage({ ton: 'succes', texte: `Lot ${n.lot!.numero} sorti du stock et enregistré comme périmé.` });
      setConfirmation(null);
      setDeplie(null);
      for (const cle of ['peremptions', 'stock', 'mouvements', 'alertes', 'dashboard', 'lots']) {
        queryClient.invalidateQueries({ queryKey: [cle] });
      }
    },
    onError: (e) => setMessage({ ton: 'erreur', texte: messageErreur(e, 'La sortie du lot a échoué.') }),
  });

  const fermer = (rendreFocus = false) => {
    setOuvert(false);
    setDeplie(null);
    setConfirmation(null);
    setMessage(null);
    if (rendreFocus) cloche.current?.focus();
  };

  // Se ferme au clic à l'extérieur et avec Échap (focus rendu à la cloche).
  useEffect(() => {
    if (!ouvert) return;
    const clicExterieur = (event: MouseEvent) => {
      if (!racine.current?.contains(event.target as Node)) fermer();
    };
    const touche = (event: KeyboardEvent) => {
      if (event.key === 'Escape') fermer(true);
    };
    document.addEventListener('mousedown', clicExterieur);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('mousedown', clicExterieur);
      document.removeEventListener('keydown', touche);
    };
  }, [ouvert]);

  const basculer = () => {
    if (ouvert) return fermer();
    setOuvert(true);
    void requete.refetch();
  };

  const aller = (chemin: string, etat?: unknown) => {
    fermer();
    navigate(chemin, etat ? { state: etat } : undefined);
  };

  const cliquer = (n: Notification) => {
    setDeplie((actuel) => (actuel === n.cle ? null : n.cle));
    setConfirmation(null);
    if (!n.lue) marquer.mutate([n.cle]);
  };

  const visibles = filtre === 'TOUT' ? notifications : notifications.filter((n) => n.niveau === filtre);
  const compte = (cle: Niveau | 'TOUT') =>
    notifications.filter((n) => !n.lue && (cle === 'TOUT' || n.niveau === cle)).length;
  // Heure de la dernière lecture : les « il y a … » restent cohérents avec les données.
  const maintenant = requete.dataUpdatedAt;

  return (
    <div ref={racine} className="relative">
      <button
        ref={cloche}
        type="button"
        onClick={basculer}
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        aria-label={nonLues > 0 ? `Notifications : ${nonLues} non lue${nonLues > 1 ? 's' : ''}` : 'Notifications'}
        title="Notifications"
        className={cn(
          'relative inline-flex size-9 items-center justify-center rounded-md text-steel-700 transition-colors hover:bg-survol hover:text-ink-900',
          ouvert && 'bg-survol text-ink-900',
        )}
      >
        <Bell className="size-[18px]" aria-hidden="true" />
        {nonLues > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full bg-rupture px-1 text-center text-[11px] leading-[18px] font-semibold text-sur-couleur tabular-nums ring-2 ring-surface"
            aria-hidden="true"
          >
            {nonLues > 99 ? '99+' : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="apparition fixed inset-x-2 top-[64px] z-40 flex max-h-[calc(100dvh-80px)] flex-col rounded-xl border border-rule bg-surface shadow-pop md:absolute md:inset-x-auto md:top-[calc(100%+8px)] md:right-0 md:max-h-[600px] md:w-[420px]"
        >
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
            <h2 className="text-panneau text-ink-900">Notifications</h2>
            <button
              type="button"
              onClick={() => marquer.mutate(notifications.filter((n) => !n.lue).map((n) => n.cle))}
              disabled={nonLues === 0}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-meta font-semibold text-action transition-colors hover:bg-action-wash disabled:cursor-default disabled:bg-transparent disabled:text-steel-500"
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              Tout marquer comme lu
            </button>
          </div>

          <div role="group" aria-label="Filtrer par gravité" className="flex gap-1.5 overflow-x-auto border-b border-rule px-4 pb-3">
            {FILTRES.map(({ cle, libelle }) => {
              const actif = filtre === cle;
              const n = compte(cle);
              return (
                <button
                  key={cle}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => {
                    setFiltre(cle);
                    setDeplie(null);
                  }}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-meta font-medium transition-colors',
                    actif ? 'border-action bg-action text-sur-couleur' : 'border-rule bg-surface text-steel-700 hover:bg-survol',
                  )}
                >
                  {libelle}
                  <span
                    className={cn(
                      'min-w-5 rounded px-1 text-center text-[11px] leading-4 font-semibold tabular-nums',
                      actif ? 'bg-white/20 text-sur-couleur' : cle === 'TOUT' ? 'bg-survol text-steel-700' : cn(STYLE_NIVEAU[cle].fond, STYLE_NIVEAU[cle].texte),
                    )}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>

          <ActivationPush />

          {message && (
            <p
              role="status"
              className={cn('mx-3 mt-3 rounded-md px-3 py-2 text-meta', message.ton === 'succes' ? 'bg-ok-wash text-ok' : 'bg-rupture-wash text-rupture')}
            >
              {message.texte}
            </p>
          )}

          <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto p-2">
            {requete.isLoading && <li className="px-4 py-10 text-center text-corps text-steel-500">Chargement…</li>}
            {requete.isError && (
              <li className="px-4 py-10 text-center text-corps text-steel-500">
                Impossible de charger les notifications.{' '}
                <button type="button" className="font-semibold text-action hover:underline" onClick={() => void requete.refetch()}>
                  Réessayer
                </button>
              </li>
            )}
            {requete.isSuccess && visibles.length === 0 && (
              <li className="px-4 py-10 text-center text-corps text-steel-500">
                {filtre === 'TOUT' ? 'Aucune alerte en cours. Tout va bien.' : 'Rien à signaler dans cette catégorie.'}
              </li>
            )}
            {visibles.map((n) => {
              const style = STYLE_NIVEAU[n.niveau];
              const { genre, Icone } = PRESENTATION[n.type];
              const estDeplie = deplie === n.cle;
              return (
                <li key={n.cle} className={cn('rounded-lg border', n.lue ? 'border-transparent' : 'border-rule bg-surface-elevee')}>
                  <button
                    type="button"
                    onClick={() => cliquer(n)}
                    aria-expanded={estDeplie}
                    className="grid w-full grid-cols-[36px_minmax(0,1fr)_8px] items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-survol"
                  >
                    <span className={cn('inline-flex size-9 items-center justify-center rounded-lg', style.fond, style.texte)}>
                      <Icone className="size-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className={cn('block text-meta font-semibold', style.texte)}>{genre}</span>
                      <span className="mt-0.5 block text-corps text-steel-700">
                        <span className={cn('text-ink-900', n.lue ? 'font-medium' : 'font-semibold')}>
                          {n.bienvenue ? `${n.bienvenue.nom},` : n.produit?.nom}
                        </span>
                        {n.produit?.reference && <span className="font-mono text-meta text-steel-500"> {n.produit.reference}</span>} {phrase(n)}
                      </span>
                      <span className="mt-1 block text-meta text-steel-500">{quand(n, maintenant)}</span>
                    </span>
                    <span className={cn('mt-1.5 size-2 rounded-full', n.lue ? 'invisible' : style.point)}>
                      {!n.lue && <span className="sr-only">Non lue</span>}
                    </span>
                  </button>

                  {estDeplie && (
                    <div className="apparition mx-3 mb-3 ml-[60px] flex flex-col gap-2.5 rounded-md bg-survol px-3 py-2.5">
                      {!n.bienvenue && <Chiffres n={n} />}
                      {n.bienvenue ? (
                        <div className="flex flex-wrap gap-2">
                          {premiersPas(n.bienvenue).map((pas, i) => (
                            <Button key={pas.chemin} taille="sm" variant={i === 0 ? 'primary' : 'secondary'} onClick={() => aller(pas.chemin)}>
                              {pas.libelle}
                            </Button>
                          ))}
                        </div>
                      ) : confirmation === n.cle ? (
                        <div className="flex flex-col gap-2">
                          <p className="text-meta text-steel-700">
                            Le lot entier quitte le stock et l’historique l’enregistre comme une perte (périmé).
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button taille="sm" variant="danger" loading={sortirLot.isPending} onClick={() => sortirLot.mutate(n)}>
                              Sortir {quantite(n.lot!.quantite, n.produit!.uniteMesure)}
                            </Button>
                            <Button taille="sm" variant="secondary" onClick={() => setConfirmation(null)}>
                              Garder le lot
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {n.stock && (
                            <>
                              <Button
                                taille="sm"
                                onClick={() =>
                                  aller('/commandes/nouvelle', {
                                    lignes: [{ produitId: n.produit!.id, quantiteCommandee: Math.max(n.stock!.seuil - n.stock!.actuel, 1) }],
                                  })
                                }
                              >
                                <ShoppingCart className="size-4" aria-hidden="true" />
                                Commander
                              </Button>
                              <Button taille="sm" variant="secondary" onClick={() => aller(`/produits/${n.produit!.id}`)}>
                                Voir le produit
                              </Button>
                            </>
                          )}
                          {n.type === 'LOT_PERIME' && (
                            <Button taille="sm" variant="danger" onClick={() => setConfirmation(n.cle)}>
                              Sortir le lot
                            </Button>
                          )}
                          {n.lot && (
                            <Button taille="sm" variant="secondary" onClick={() => aller('/peremptions')}>
                              Voir les péremptions
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex justify-center border-t border-rule p-2">
            <Link
              to="/alertes"
              onClick={() => fermer()}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-corps font-semibold text-action transition-colors hover:bg-action-wash"
            >
              Voir toutes les alertes
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Chiffres({ n }: { n: Notification }) {
  const unite = n.produit?.uniteMesure ?? null;
  const paires: [string, string][] = n.stock
    ? [
        ['Stock', quantite(n.stock.actuel, unite)],
        ['Seuil', formatNombre(n.stock.seuil)],
        ['À commander', formatNombre(Math.max(n.stock.seuil - n.stock.actuel, 0))],
      ]
    : n.lot
      ? [
          ['Lot', n.lot.numero],
          ['Quantité', quantite(n.lot.quantite, unite)],
          ['Emplacement', n.lot.emplacement],
          ...(n.lot.valeur > 0 ? [['Valeur', `${formatNombre(n.lot.valeur)} GNF`] as [string, string]] : []),
        ]
      : [];
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-meta tabular-nums">
      {paires.map(([libelle, valeur]) => (
        <div key={libelle} className="flex gap-1">
          <dt className="text-steel-500">{libelle}</dt>
          <dd className="font-semibold text-ink-900">{valeur}</dd>
        </div>
      ))}
    </dl>
  );
}
