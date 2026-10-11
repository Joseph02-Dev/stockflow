import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { api, messageErreur } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { PointsChargement } from '@/components/ui/PointsChargement';

interface Message {
  role: 'user' | 'assistant';
  contenu: string;
  sources?: string[];
}

interface ReponseAssistant {
  reponse: string;
  sources: { outil: string }[];
}

/** Limites du serveur (ChatDto) : au-delà, la requête serait refusée. */
const MESSAGES_MAX = 10;
const LONGUEUR_MAX = 2000;

const LIBELLES_SOURCES: Record<string, string> = {
  rechercher_produits: 'Recherche de produits',
  stock_produit: 'Stock par emplacement',
  produits_sous_seuil: 'Produits sous le seuil',
  lots_proches_peremption: 'Lots proches de la péremption',
  resume_ventes: 'Résumé des ventes',
  meilleurs_produits: 'Meilleures ventes',
};

const SUGGESTIONS = [
  'Quels produits sont sous leur seuil d’alerte ?',
  'Compare mes ventes de cette semaine à la semaine précédente.',
  'Quels produits se sont le plus vendus ce mois-ci ?',
];

/** Derniers messages, en commençant par une question (attendu par le serveur). */
function historiqueAEnvoyer(messages: Message[]) {
  const recents = messages.slice(-MESSAGES_MAX);
  const debut = recents.findIndex((m) => m.role === 'user');
  return recents.slice(debut === -1 ? recents.length : debut).map(({ role, contenu }) => ({ role, contenu }));
}

function messageErreurAssistant(erreur: unknown) {
  // Quota de l'entreprise : le message du serveur dit quand réessayer.
  if (axios.isAxiosError(erreur)) {
    const data = erreur.response?.data as { code?: string; message?: string } | undefined;
    if (data?.code === 'QUOTA_ASSISTANT_ATTEINT' && data.message) return data.message;
  }
  return messageErreur(erreur, 'L’assistant n’a pas pu répondre. Réessayez.');
}

/**
 * Assistant IA (module « assistant ») : questions sur le stock et les
 * ventes, réponses calculées côté serveur à partir des données de
 * l'entreprise. Lecture seule ; la conversation n'est pas enregistrée et
 * disparaît à la fermeture de l'onglet.
 */
export function AssistantPanel({ ouvert, onFermer }: { ouvert: boolean; onFermer: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [saisie, setSaisie] = useState('');
  const fin = useRef<HTMLDivElement>(null);

  const envoyer = useMutation({
    mutationFn: async (conversation: Message[]) =>
      (await api.post<ReponseAssistant>('/assistant/chat', { messages: historiqueAEnvoyer(conversation) })).data,
    onSuccess: (data) =>
      setMessages((precedents) => [
        ...precedents,
        { role: 'assistant', contenu: data.reponse, sources: [...new Set(data.sources.map((s) => s.outil))] },
      ]),
  });

  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end' });
  }, [messages, envoyer.isPending]);

  function poser(question: string) {
    const texte = question.trim().slice(0, LONGUEUR_MAX);
    if (!texte || envoyer.isPending) return;
    const conversation: Message[] = [...messages, { role: 'user', contenu: texte }];
    setMessages(conversation);
    setSaisie('');
    envoyer.mutate(conversation);
  }

  function soumettre(event: FormEvent) {
    event.preventDefault();
    poser(saisie);
  }

  function toucheClavier(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      poser(saisie);
    }
  }

  return (
    <Drawer
      ouvert={ouvert}
      onFermer={onFermer}
      titre="Assistant"
      description="Questions sur votre stock et vos ventes. Réponses calculées à partir de vos données, sans rien modifier."
      pied={
        <form onSubmit={soumettre} className="flex w-full items-end gap-2">
          <label htmlFor="question-assistant" className="sr-only">
            Votre question
          </label>
          <textarea
            id="question-assistant"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={toucheClavier}
            rows={2}
            maxLength={LONGUEUR_MAX}
            placeholder="Ex. combien reste-t-il de sacs de riz ?"
            className="min-w-0 flex-1 resize-none rounded-md border border-rule-strong bg-surface-elevee px-3 py-2 text-corps text-ink-900 placeholder:text-steel-400"
          />
          <Button type="submit" loading={envoyer.isPending} disabled={!saisie.trim()}>
            Envoyer
          </Button>
        </form>
      }
    >
      <div className="flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-corps text-steel-500">Essayez par exemple :</p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => poser(suggestion)}
                className="rounded-md border border-rule px-3 py-2 text-left text-corps text-ink-900 transition-colors hover:bg-survol"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={cn('flex flex-col gap-1', message.role === 'user' ? 'items-end' : 'items-start')}>
            <p
              className={cn(
                'max-w-[85%] rounded-md px-3 py-2 text-corps whitespace-pre-line',
                message.role === 'user' ? 'bg-action text-sur-couleur' : 'border border-rule bg-surface-elevee text-ink-900',
              )}
            >
              {message.contenu}
            </p>
            {message.sources && message.sources.length > 0 && (
              <p className="text-meta text-steel-500">
                Sources : {message.sources.map((s) => LIBELLES_SOURCES[s] ?? s).join(', ')}
              </p>
            )}
          </div>
        ))}

        {envoyer.isPending && (
          <p className="flex items-center gap-2 text-corps text-steel-500" role="status">
            <PointsChargement /> Recherche dans vos données…
          </p>
        )}
        {envoyer.isError && <Alert variant="error">{messageErreurAssistant(envoyer.error)}</Alert>}
        <div ref={fin} />
      </div>
    </Drawer>
  );
}
