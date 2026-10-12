import Anthropic from '@anthropic-ai/sdk';
import {
  ErreurFournisseurIA,
  type DefinitionOutil,
  type FinTour,
  type FournisseurIA,
  type MessageTexte,
  type ResultatOutil,
  type SessionIA,
  type TourIA,
} from './fournisseur-ia.js';

/** Modèle par défaut ; ASSISTANT_MODELE permet d'en changer sans livrer de code. */
export const MODELE_PAR_DEFAUT = 'claude-opus-5-5';

/** Sous-ensemble du client Anthropic utilisé : remplaçable dans les tests. */
export type ClientMessages = Pick<Anthropic['beta']['messages'], 'create'>;

const FINS: Partial<Record<string, FinTour>> = {
  end_turn: 'reponse',
  stop_sequence: 'reponse',
  tool_use: 'outils',
  refusal: 'refus',
  max_tokens: 'tronque',
};

/** Erreur du SDK → motif court, journalisable (jamais le message brut, qui peut citer la requête). */
export function motifErreur(erreur: unknown): string {
  if (erreur instanceof Anthropic.APIConnectionTimeoutError) return 'delai_depasse';
  if (erreur instanceof Anthropic.APIConnectionError) return 'reseau';
  if (erreur instanceof Anthropic.AuthenticationError) return 'authentification';
  if (erreur instanceof Anthropic.PermissionDeniedError) return 'permission';
  if (erreur instanceof Anthropic.RateLimitError) return 'limite_fournisseur';
  if (erreur instanceof Anthropic.BadRequestError) return 'requete_invalide';
  if (erreur instanceof Anthropic.APIError) return `http_${erreur.status ?? 'inconnu'}`;
  return 'inconnu';
}

/**
 * Explication du fournisseur, pour les journaux du serveur (jamais pour le
 * client) : statut, type et message de l'erreur Anthropic (« invalid
 * x-api-key », « credit balance is too low »…), identifiant de requête.
 * Les messages d'erreur de l'API citent des paramètres, pas le contenu des
 * conversations ; tronqués par prudence.
 */
export function detailErreur(erreur: unknown): string {
  const tronquer = (texte: string) => (texte.length > 300 ? `${texte.slice(0, 300)}…` : texte);
  if (erreur instanceof Anthropic.APIError && erreur.status !== undefined) {
    const corps = (erreur.error as { error?: { type?: string; message?: string } } | undefined)?.error;
    const requete = erreur.requestID ? ` (request-id ${erreur.requestID})` : '';
    return tronquer(`HTTP ${erreur.status} ${corps?.type ?? ''} : ${corps?.message ?? erreur.message}`) + requete;
  }
  if (erreur instanceof Error) {
    const cause = erreur.cause instanceof Error ? ` — ${erreur.cause.message}` : '';
    return tronquer(`${erreur.message}${cause}`);
  }
  return 'erreur inconnue';
}

/**
 * Fournisseur Anthropic (API Messages, appel d'outils). Une session garde
 * l'historique complet renvoyé par l'API (blocs de réflexion compris, à
 * renvoyer tels quels) ; le navigateur ne voit et ne renvoie que du texte.
 */
export class FournisseurAnthropic implements FournisseurIA {
  readonly disponible: boolean;
  private readonly client: ClientMessages | null;

  constructor(
    private readonly options: { cle?: string; modele?: string; client?: ClientMessages } = {},
  ) {
    // 45 s par appel et une seule nouvelle tentative : une panne du
    // fournisseur doit vite rendre la main, le reste de l'application n'en dépend pas.
    this.client =
      options.client ?? (options.cle ? new Anthropic({ apiKey: options.cle, timeout: 45_000, maxRetries: 1 }).beta.messages : null);
    this.disponible = this.client !== null;
  }

  demarrer(parametres: { systeme: string; contexte: string; outils: DefinitionOutil[]; historique: MessageTexte[] }): SessionIA {
    if (!this.client) throw new ErreurFournisseurIA('non_configure');
    const client = this.client;
    const modele = this.options.modele || MODELE_PAR_DEFAUT;
    const outils: Anthropic.Beta.BetaTool[] = parametres.outils.map((o) => ({
      name: o.nom,
      description: o.description,
      input_schema: o.schema as Anthropic.Beta.BetaTool.InputSchema,
      strict: true,
    }));
    // Consignes stables d'abord (mises en cache avec les outils), puis le
    // contexte du jour, qui change et resterait sinon hors du cache.
    const systeme: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: 'text', text: parametres.systeme, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: parametres.contexte },
    ];
    const messages: Anthropic.Beta.BetaMessageParam[] = parametres.historique.map((m) => ({
      role: m.role,
      content: m.contenu,
    }));

    return {
      async tour(resultats?: ResultatOutil[]): Promise<TourIA> {
        if (resultats?.length) {
          messages.push({
            role: 'user',
            content: resultats.map((r) => ({
              type: 'tool_result' as const,
              tool_use_id: r.appelId,
              content: r.contenu,
              is_error: r.erreur,
            })),
          });
        }
        let reponse: Anthropic.Beta.BetaMessage;
        try {
          reponse = await client.create({
            model: modele,
            max_tokens: 16_000,
            // Questions courtes sur des données déjà calculées : effort bas.
            output_config: { effort: 'low' },
            // Si le modèle décline une demande légitime, l'API la rejoue sur
            // le modèle de repli recommandé, dans le même appel.
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system: systeme,
            tools: outils,
            messages,
          });
        } catch (erreur) {
          throw new ErreurFournisseurIA(motifErreur(erreur), { cause: erreur, detail: detailErreur(erreur) });
        }
        // Historique intégral (réflexion comprise) : exigé pour poursuivre la boucle d'outils.
        messages.push({ role: 'assistant', content: reponse.content as Anthropic.Beta.BetaContentBlockParam[] });

        const texte = reponse.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        const appels = reponse.content
          .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
          .map((b) => ({ id: b.id, nom: b.name, arguments: b.input }));
        const fin = FINS[reponse.stop_reason ?? ''] ?? 'tronque';
        return {
          // Demande d'outil sans appel exploitable : traitée comme une réponse coupée.
          fin: fin === 'outils' && appels.length === 0 ? 'tronque' : fin,
          texte,
          appels,
          jetons: { entree: reponse.usage.input_tokens, sortie: reponse.usage.output_tokens },
        };
      },
    };
  }
}
