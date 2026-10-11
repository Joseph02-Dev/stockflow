import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, Send, Trash2 } from 'lucide-react';
import { api, messageErreur } from '@/lib/api';
import { dateHeure } from '@/lib/montant';
import { useModules } from '@/lib/useModules';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Card, PanneauEntete } from '@/components/patterns/Page';
import { ErrorState, LoadingState } from '@/components/patterns/States';

interface Abonnement {
  id: string;
  url: string;
  evenements: string[];
  actif: boolean;
  echecsConsecutifs: number;
  createdAt: string;
}

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

  const abonnements = useQuery({
    queryKey: ['webhooks'],
    enabled: modules.webhooks,
    queryFn: async () => (await api.get<Abonnement[]>('/webhooks')).data,
  });
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
    <div className="flex max-w-[820px] flex-col gap-4">
      <Card>
        <PanneauEntete titre="API" meta="Pour relier StockFlow à un autre logiciel" />
        <div className="flex flex-col gap-2 p-5 text-corps text-steel-700">
          <p>
            La documentation interactive de l’API (OpenAPI) décrit toutes les routes, leurs paramètres et leurs réponses.
            Authentification : jeton obtenu par <code className="font-mono">POST /auth/login</code>.
          </p>
          <a
            href={`${BASE_API}/docs`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 self-start font-medium text-action hover:underline"
          >
            Ouvrir la documentation de l’API
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </div>
      </Card>

      <Card>
        <PanneauEntete titre="Webhooks" meta="Un POST JSON signé à votre URL à chaque événement choisi" />
        {!modules.webhooks ? (
          <p className="p-5 text-corps text-steel-500">Activez le module « Webhooks » dans l’onglet Modules.</p>
        ) : (
          <div className="flex flex-col gap-4 p-5">
            {message && <Alert variant={message.ok ? 'success' : 'error'}>{message.texte}</Alert>}
            {secret && (
              <Alert variant="info">
                Secret de signature — copiez-le maintenant, il ne sera plus affiché :{' '}
                <code className="font-mono font-semibold break-all">{secret}</code>. Chaque envoi porte l’en-tête{' '}
                <code className="font-mono">X-StockFlow-Signature: t=…,v1=…</code> : HMAC-SHA256 de « t.corps » avec ce secret.
              </Alert>
            )}
            {abonnements.isLoading ? (
              <LoadingState lignes={2} />
            ) : abonnements.isError ? (
              <ErrorState message={messageErreur(abonnements.error)} onRetry={() => abonnements.refetch()} />
            ) : (
              abonnements.data!.length > 0 && (
                <ul className="divide-y divide-rule rounded-md border border-rule">
                  {abonnements.data!.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                      <span className="min-w-0 flex-1 basis-64">
                        <span className="block truncate font-mono text-corps text-ink-900">{a.url}</span>
                        <span className="block truncate text-meta text-steel-500">
                          {a.evenements.join(', ')}
                          {a.echecsConsecutifs > 0 && ` · ${a.echecsConsecutifs} échec(s) consécutif(s)`}
                        </span>
                      </span>
                      <Badge variant={a.actif ? 'ok' : 'neutral'}>{a.actif ? 'Actif' : 'Désactivé'}</Badge>
                      <Button variant="ghost" taille="sm" onClick={() => setJournal(a)}>
                        Journal
                      </Button>
                      <Button variant="ghost" taille="sm" loading={tester.isPending} onClick={() => tester.mutate(a.id)}>
                        <Send className="size-4" aria-hidden="true" />
                        Tester
                      </Button>
                      <Button variant="ghost" taille="sm" onClick={() => basculer.mutate(a)}>
                        {a.actif ? 'Désactiver' : 'Réactiver'}
                      </Button>
                      <Button variant="ghost" taille="sm" loading={supprimer.isPending} onClick={() => supprimer.mutate(a.id)}>
                        <Trash2 className="size-4" aria-hidden="true" />
                        <span className="sr-only">Supprimer</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )
            )}

            <div className="flex flex-col gap-3 rounded-md border border-rule bg-entete-groupe p-3">
              <Input label="URL du destinataire" placeholder="https://exemple.com/webhooks/stockflow" value={url} onChange={(e) => setUrl(e.target.value)} />
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-corps font-medium text-ink-900">Événements</legend>
                {EVENEMENTS.map((e) => (
                  <label key={e.valeur} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--color-action)]"
                      checked={evenements.includes(e.valeur)}
                      onChange={() => basculerEvenement(e.valeur)}
                    />
                    <span className="text-corps text-ink-900">
                      {e.libelle} <span className="font-mono text-meta text-steel-500">{e.valeur}</span>
                      <span className="block text-meta text-steel-500">{e.aide}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
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
          </div>
        )}
      </Card>

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
