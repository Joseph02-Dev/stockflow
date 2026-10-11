import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { PrismaService } from '../../config/prisma.service.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import {
  ErreurFournisseurIA,
  FOURNISSEUR_IA,
  type DefinitionOutil,
  type FournisseurIA,
  type ResultatOutil,
  type TourIA,
} from './fournisseur-ia.js';
import { ErreurOutil, OutilsAssistantService, outilsDisponibles } from './outils-assistant.js';
import { PROMPT_SYSTEME, contexteDuJour } from './prompt-systeme.js';
import { QuotaAssistant } from './quota-assistant.js';
import type { ChatDto } from './dto/chat.dto.js';

/** Tours d'appels d'outils au plus par question : borne le coût et la durée. */
export const TOURS_OUTILS_MAX = 4;

export const REPONSE_REFUS = 'Je ne peux pas répondre à cette demande. Posez-moi une question sur vos produits, votre stock ou vos ventes.';
export const REPONSE_INCOMPLETE = 'Je n’ai pas pu terminer cette réponse. Reformulez la question de façon plus précise.';

export interface Source {
  outil: string;
  /** Arguments validés, sans donnée d'identité (affichés sous la réponse). */
  arguments: unknown;
}

/**
 * Assistant IA en lecture seule. Le modèle choisit des outils et rédige ;
 * le serveur décide de tout le reste : entreprise (contexte authentifié),
 * outils proposés (modules actifs), validation des arguments, nombre de
 * tours, quota. Rien n'est conservé : ni question, ni réponse.
 */
@Injectable()
export class AssistantService {
  private readonly journal = new Logger('Assistant');

  constructor(
    @Inject(FOURNISSEUR_IA) private readonly fournisseur: FournisseurIA,
    private readonly outils: OutilsAssistantService,
    private readonly quota: QuotaAssistant,
    private readonly prisma: PrismaService,
  ) {}

  async discuter(contexte: RequestContext, dto: ChatDto) {
    const { messages } = dto;
    if (messages[0].role !== 'user' || messages[messages.length - 1].role !== 'user') {
      throw new BadRequestException('La conversation doit commencer et se terminer par un message de l’utilisateur.');
    }
    if (!this.fournisseur.disponible) {
      throw new ServiceUnavailableException({
        code: 'ASSISTANT_NON_CONFIGURE',
        message: 'L’assistant n’est pas encore configuré sur ce serveur.',
      });
    }
    await this.quota.consommer(contexte.entrepriseId);

    const debut = Date.now();
    const { moduleLots } = await this.prisma.entreprise.findUniqueOrThrow({
      where: { id: contexte.entrepriseId },
      select: { moduleLots: true },
    });
    const proposes = outilsDisponibles({ lots: moduleLots });
    const session = this.fournisseur.demarrer({
      systeme: PROMPT_SYSTEME,
      contexte: contexteDuJour(),
      outils: proposes,
      historique: messages,
    });

    const sources: Source[] = [];
    const jetons = { entree: 0, sortie: 0 };
    let tours = 0;
    let tour: TourIA;
    try {
      tour = await session.tour();
      for (;;) {
        jetons.entree += tour.jetons.entree;
        jetons.sortie += tour.jetons.sortie;
        if (tour.fin !== 'outils' || tours >= TOURS_OUTILS_MAX) break;
        tours++;
        const resultats = await Promise.all(
          tour.appels.map((appel) => this.executer(contexte.entrepriseId, appel.id, appel.nom, appel.arguments, proposes, sources)),
        );
        tour = await session.tour(resultats);
      }
    } catch (erreur) {
      if (!(erreur instanceof ErreurFournisseurIA)) throw erreur;
      this.journal.warn(`Fournisseur IA indisponible (${erreur.motif}) pour l'entreprise ${contexte.entrepriseId}, après ${tours} tour(s) d'outils.`);
      throw new ServiceUnavailableException({
        code: 'ASSISTANT_INDISPONIBLE',
        message: 'L’assistant est momentanément indisponible. Le reste de StockFlow fonctionne normalement : réessayez dans quelques minutes.',
      });
    }

    const reponse = tour.fin === 'reponse' && tour.texte ? tour.texte : tour.fin === 'refus' ? REPONSE_REFUS : REPONSE_INCOMPLETE;
    // Métadonnées seulement : jamais le texte des questions ni des réponses.
    const fin = tour.fin === 'outils' ? 'tours_max' : tour.fin;
    this.journal.log(
      `Question à l'assistant : entreprise ${contexte.entrepriseId}, fin ${fin}, outils [${sources.map((s) => s.outil).join(', ')}], ` +
        `${jetons.entree} jetons en entrée, ${jetons.sortie} en sortie, ${Date.now() - debut} ms.`,
    );
    return { reponse, sources };
  }

  /** Un outil en erreur répond au modèle (qui s'en explique) au lieu d'interrompre la question. */
  private async executer(
    entrepriseId: string,
    appelId: string,
    nom: string,
    brut: unknown,
    proposes: DefinitionOutil[],
    sources: Source[],
  ): Promise<ResultatOutil> {
    try {
      const resultat = await this.outils.executer(entrepriseId, nom, brut, proposes);
      sources.push({ outil: nom, arguments: brut });
      return { appelId, contenu: JSON.stringify(resultat), erreur: false };
    } catch (erreur) {
      if (erreur instanceof ErreurOutil) return { appelId, contenu: erreur.message, erreur: true };
      // Panne inattendue (base indisponible…) : journalisée, détail jamais transmis au modèle.
      this.journal.error(`Outil « ${nom} » de l'assistant en échec pour l'entreprise ${entrepriseId} : ${(erreur as Error).message}`);
      Sentry.captureException(erreur);
      return { appelId, contenu: 'Erreur interne : données momentanément indisponibles.', erreur: true };
    }
  }
}
