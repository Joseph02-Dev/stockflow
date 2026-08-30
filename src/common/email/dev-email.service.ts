import { Injectable, Logger } from '@nestjs/common';
import type { EmailMessage, EmailService } from './email.service.js';

/**
 * Transport de développement : n'envoie réellement aucun email.
 * Journalise le contenu et conserve un historique en mémoire, consultable
 * via getSentEmails() — utile pour tester le flux d'invitation (AUTH-003)
 * sans dépendre d'un fournisseur externe ni de vraies boîtes mail.
 *
 * À remplacer par une implémentation réelle (ex. Resend, SendGrid) avant
 * la mise en production — voir EMAIL_PROVIDER dans la configuration.
 */
@Injectable()
export class DevEmailService implements EmailService {
  private readonly logger = new Logger(DevEmailService.name);
  private readonly sentEmails: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(`[DEV EMAIL] À: ${message.to} | Sujet: ${message.subject}\n${message.body}`);
    this.sentEmails.push(message);
  }

  /** Réservé aux tests et au débogage local. */
  getSentEmails(): readonly EmailMessage[] {
    return this.sentEmails;
  }

  /** Réservé aux tests, pour repartir d'un état propre entre les cas de test. */
  clear(): void {
    this.sentEmails.length = 0;
  }
}
