import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import type { EmailMessage, EmailService } from './email.service.js';

/**
 * Transport de production — envoie réellement les emails via Resend.
 * Les erreurs d'envoi sont journalisées mais jamais propagées : un email
 * qui échoue à partir (fournisseur en panne, adresse invalide) ne doit
 * jamais faire échouer l'opération métier qui l'a déclenché (inscription,
 * invitation, réinitialisation) — même principe déjà appliqué aux
 * notifications d'alerte.
 */
@Injectable()
export class ResendEmailService implements EmailService {
  private readonly logger = new Logger(ResendEmailService.name);
  private readonly resend: Resend;
  private readonly expediteur: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY est requis quand EMAIL_PROVIDER=resend.');
    }
    this.resend = new Resend(apiKey);
    this.expediteur = process.env.EMAIL_FROM ?? 'StockFlow <onboarding@resend.dev>';
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      const resultat = await this.resend.emails.send({
        from: this.expediteur,
        to: message.to,
        subject: message.subject,
        text: message.body,
      });
      if (resultat.error) {
        this.logger.error(`Échec d'envoi à ${message.to} : ${resultat.error.message}`);
      }
    } catch (erreur) {
      this.logger.error(`Échec d'envoi à ${message.to}`, erreur instanceof Error ? erreur.stack : undefined);
    }
  }
}
