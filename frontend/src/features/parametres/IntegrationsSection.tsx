import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, ListChecks, Plus, Send, Trash2 } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { dateHeure } from '@/lib/montant';
import { useModules } from '@/lib/useModules';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { boutonClasses } from '@/components/ui/boutonClasses';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, LoadingState } from '@/components/patterns/States';
import { useWebhooks, type Abonnement } from './donnees';
import { EnteteCarte, EnteteSection } from './EnteteSection';

interface Livraison {
  id: string;
  statut: 'EN_ATTENTE' | 'LIVREE' | 'ECHEC';
  tentatives: number;
  codeHttp: number | null;
  erreur: string | null;
  createdAt: string;
  evenement: { type: string };
}

const EVENEMENTS = [
  { valeur: 'mouvement.cree', libelle: 'Mouvement de stock', aide: 'Chaque entrée, sortie, vente, transfert, perte…' },
  { valeur: 'alerte.stock', libelle: 'Alerte de stock', aide: 'Stock faible ou rupture' },
  { valeur: 'lot.peremption', libelle: 'Péremptions', aide: 'Chaque matin : lots périmés ou bientôt périmés' },
];

const STATUTS: Record<Livraison['statut'], { libelle: string; variante: 'ok' | 'faible' | 'rupture' }> = {
  LIVREE: { libelle: 'Livrée', variante: 'ok' },
  EN_ATTENTE: { libelle: 'En attente', variante: 'faible' },
  ECHEC: { libelle: 'Échec', variante: 'rupture' },
};

/** Base de l'API, pour le lien vers sa documentation. */
const BASE_API = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

/**
 * Intégrations : documentation de l'API et webhooks (module « webhooks »).
 * Le secret de signature d'un webhook n'est montré qu'une fois.
 */
export function IntegrationsSection() {
  const queryClient = useQueryClient();
  const modules = useModules();
  const [url, setUrl] = useState('');
  const [evenements, setEvenements] = useState<string[]>(['mouvement.cree']);
  const [secret, setSecret] = useState<string | null>(null);
  const [journal, setJournal] = useState<Abonnement | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const abonnements = useWebhooks(modules.webhooks);
  const livraisons = useQuery({
    queryKey: ['webhooks', journal?.id, 'livraisons'],
    enabled: journal !== null,
    queryFn: async () => (await api.get<Livraison[]>(`/webhooks/${journal!.id}/livraisons`)).data,
  });
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['webhooks'] });
  const echec = (texte: string) => (e: unknown) => setMessage({ ok: false, texte: messageErreur(e, texte) });

  const creer = useMutation({
    mutationFn: async () => (await api.post<Abonnement & { secret: string }>('/webhooks', { url: url.trim(), evenements })).data,
    onSuccess: (data) => {
      setSecret(data.secret);
      setUrl('');
      setMessage(null);
      rafraichir();
    },
    onError: echec('La création a échoué.'),
  });
  const basculer = useMutation({
    mutationFn: async (a: Abonnement) => api.patch(`/webhooks/${a.id}`, { actif: !a.actif }),
    onSuccess: rafraichir,
    onError: echec('La modification a échoué.'),
  });
  const supprimer = useMutation({
    mutationFn: async (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: rafraichir,
    onError: echec('La suppression a échoué.'),
  });
  const tester = useMutation({
    mutationFn: async (id: string) => api.post(`/webhooks/${id}/test`),
    onSuccess: () => setMessage({ ok: true, texte: 'Test envoyé : il part dans les secondes qui viennent (voir « Journal »).' }),
    onError: echec('Le test a échoué.'),
  });

  const basculerEvenement = (valeur: string) =>
    setEvenements((liste) => (liste.includes(valeur) ? liste.filter((e) => e !== valeur) : [...liste, valeur]));

  return (
    <div className="flex flex-col gap-4">
      <EnteteSection titre="Intégrations" description="Relier NimbaFlow à un autre logiciel : comptabilité, site marchand…" />

      <div className="parametres-carte">
        <EnteteCarte titre="API" meta="La documentation interactive (OpenAPI) décrit toutes les routes, leurs paramètres et leurs réponses." />
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <code className="rounded-md border border-rule bg-paper px-2.5 py-1.5 font-mono text-[12.5px] text-steel-700">
            Authentification : <b className="font-semibold text-action">POST</b> /auth/login
          </code>
          <a href={`${BASE_API}/docs`} target="_blank" rel="noreferrer" className={boutonClasses('secondary', undefined, { taille: 'sm' })}>
            <ExternalLink className="size-4" aria-hidden="true" />
            Ouvrir la documentation
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
        </div>
      </div>

      <div className="parametres-carte">
        <EnteteCarte titre="Webhooks" meta="Un POST JSON signé à votre URL à chaque événement choisi." />
        {!modules.webhooks ? (
          <p className="p-4 text-corps text-steel-500 sm:p-5">Activez le module « Webhooks » dans la section Modules.</p>
        ) : (
          <>
            {(message || secret) && (
              <div className="flex flex-col gap-3 px-4 pt-4 sm:px-5">
                {message && <Alert variant={message.ok ? 'success' : 'error'}>{message.texte}</Alert>}
                {secret && (
                  <Alert variant="info">
                    Secret de signature — copiez-le maintenant, il ne sera plus affiché :{' '}
                    <code className="font-mono font-semibold break-all">{secret}</code>. Chaque envoi porte l’en-tête{' '}
                    <code className="font-mono">X-StockFlow-Signature: t=…,v1=…</code> : HMAC-SHA256 de « t.corps » avec ce secret.
                  </Alert>
                )}
              </div>
            )}
            {abonnements.isLoading ? (
              <LoadingState lignes={2} />
            ) : abonnements.isError ? (
              <ErrorState message={messageErreur(abonnements.error)} onRetry={() => abonnements.refetch()} />
            ) : (
              abonnements.data!.length > 0 && (
                <ul className="divide-y divide-rule">
                  {abonnements.data!.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                      <div className="min-w-0 flex-1 basis-72">
                        <p className="flex min-w-0 items-center gap-2.5 font-mono text-[13.5px] text-ink-900">
                          <span
                            className={cn(
                              'size-2 shrink-0 rounded-full',
                              a.actif ? 'bg-ok shadow-[0_0_0_3px_var(--color-ok-wash)]' : 'bg-rupture shadow-[0_0_0_3px_var(--color-rupture-wash)]',
                            )}
                            aria-hidden="true"
                          />
                          <span className="truncate">{a.url}</span>
                        </p>
                        <p className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge variant={a.actif ? 'ok' : 'rupture'}>
                            {a.actif ? 'Actif' : 'Désactivé'}
                            {a.echecsConsecutifs > 0 && ` · ${a.echecsConsecutifs} échec${a.echecsConsecutifs > 1 ? 's' : ''} consécutif${a.echecsConsecutifs > 1 ? 's' : ''}`}
                          </Badge>
                          {a.evenements.map((e) => (
                            <span key={e} className="inline-flex h-[22px] items-center rounded-full border border-rule bg-paper px-2 font-mono text-[11.5px] text-steel-500">
                              {e}
                            </span>
                          ))}
                        </p>
                      </div>
                      <div className="-ml-2 flex flex-wrap items-center gap-0.5 sm:ml-0">
                        <Button variant="ghost" taille="sm" onClick={() => setJournal(a)}>
                          <ListChecks className="size-4" aria-hidden="true" />
                          Journal
                        </Button>
                        <Button variant="ghost" taille="sm" loading={tester.isPending && tester.variables === a.id} onClick={() => tester.mutate(a.id)}>
                          <Send className="size-4" aria-hidden="true" />
                          Tester
                        </Button>
                        <Button variant={a.actif ? 'ghost' : 'secondary'} taille="sm" onClick={() => basculer.mutate(a)}>
                          {a.actif ? 'Désactiver' : 'Réactiver'}
                        </Button>
                        <Button
                          variant="ghost"
                          taille="sm"
                          icone
                          className="text-rupture hover:bg-rupture-wash"
                          loading={supprimer.isPending && supprimer.variables === a.id}
                          onClick={() => supprimer.mutate(a.id)}
                          aria-label={`Supprimer le webhook ${a.url}`}
                          title="Supprimer"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}

            <div className="flex flex-col gap-3 rounded-b-[var(--radius-xl)] border-t border-rule bg-entete-groupe p-4 sm:p-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-corps font-medium text-ink-900">Nouveau destinataire</span>
                <input
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://exemple.com/webhooks/stockflow"
                  className="h-10 w-full champ rounded-lg border border-rule-strong bg-surface-elevee px-3 text-corps text-ink-900 placeholder:text-steel-400 hover:border-steel-400 focus:border-action"
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Événements">
                {EVENEMENTS.map((e) => (
                  <button
                    key={e.valeur}
                    type="button"
                    className="parametres-evenement"
                    aria-pressed={evenements.includes(e.valeur)}
                    onClick={() => basculerEvenement(e.valeur)}
                  >
                    <span className="parametres-case" aria-hidden="true">
                      {evenements.includes(e.valeur) && <Check className="size-[11px]" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-ink-900">{e.libelle}</span>
                      <span className="block font-mono text-[11px] text-steel-400">{e.valeur}</span>
                      <span className="mt-0.5 block text-[11.5px] text-steel-500">{e.aide}</span>
                    </span>
                  </button>
                ))}
              </div>
              <Button
                taille="sm"
                className="self-end"
                disabled={!url.trim().startsWith('http') || evenements.length === 0}
                loading={creer.isPending}
                onClick={() => creer.mutate()}
              >
                <Plus className="size-4" aria-hidden="true" />
                Ajouter le webhook
              </Button>
            </div>
          </>
        )}
      </div>

      {journal && (
        <Modal ouvert onFermer={() => setJournal(null)} titre="Journal des envois" description={journal.url}>
          {livraisons.isLoading ? (
            <LoadingState lignes={3} />
          ) : livraisons.isError ? (
            <ErrorState message={messageErreur(livraisons.error)} onRetry={() => livraisons.refetch()} />
          ) : livraisons.data!.length === 0 ? (
            <p className="text-corps text-steel-500">Aucun envoi pour l’instant.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {livraisons.data!.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-corps text-ink-900">{l.evenement.type}</span>
                    <span className={cn('block text-meta', l.erreur ? 'text-rupture' : 'text-steel-500')}>
                      {dateHeure(l.createdAt)} · {l.tentatives} tentative{l.tentatives > 1 ? 's' : ''}
                      {l.codeHttp !== null && ` · HTTP ${l.codeHttp}`}
                      {l.erreur && ` · ${l.erreur}`}
                    </span>
                  </span>
                  <Badge variant={STATUTS[l.statut].variante}>{STATUTS[l.statut].libelle}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}
