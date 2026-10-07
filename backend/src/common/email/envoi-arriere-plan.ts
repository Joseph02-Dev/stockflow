import { Logger, OnModuleDestroy } from '@nestjs/common';
import type { EmailMessage, EmailService } from './email.service.js';

/** À l'arrêt (redéploiement), délai laissé aux envois en cours pour se terminer. */
const DELAI_VIDAGE_MS = 15_000;

/**
 * Envoi en arrière-plan : la requête de l'utilisateur n'attend jamais le
 * fournisseur d'email (délais, nouvelles tentatives).
 *
 * Effet de sécurité : « mot de passe oublié » répond aussi vite, que le
 * compte existe ou non ; le temps de réponse ne révèle plus les adresses
 * inscrites.
 *
 * Les envois en cours sont attendus à l'arrêt du service (SIGTERM). Un
 * arrêt brutal peut en perdre : une file persistante est prévue avec
 * Redis (plan, Phase 3 partie B).
 */
export class EnvoiEnArrierePlan implements EmailService, OnModuleDestroy {
  private readonly logger = new Logger(EnvoiEnArrierePlan.name);
  private readonly enCours = new Set<Promise<void>>();

  constructor(private readonly transport: EmailService) {}

  send(message: EmailMessage): Promise<void> {
    const envoi = this.transport
      .send(message)
      .catch((erreur: unknown) => this.logger.error(`Envoi d'email interrompu : ${(erreur as Error).message}`))
      .finally(() => this.enCours.delete(envoi));
    this.enCours.add(envoi);
    return Promise.resolve();
  }

  /** Envois encore en cours (diagnostic, tests). */
  get nombreEnCours(): number {
    return this.enCours.size;
  }

  async onModuleDestroy() {
    if (this.enCours.size === 0) return;
    this.logger.log(`Arrêt : ${this.enCours.size} email(s) en cours d'envoi, attente (${DELAI_VIDAGE_MS / 1000} s maximum).`);
    let minuteur: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.allSettled([...this.enCours]),
      new Promise((r) => {
        minuteur = setTimeout(r, DELAI_VIDAGE_MS);
      }),
    ]);
    clearTimeout(minuteur);
  }
}
