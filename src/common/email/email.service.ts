export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');

/**
 * Abstraction du transport d'email. Permet de changer de fournisseur
 * (Resend, SendGrid, Postmark, ...) sans toucher au code métier qui
 * envoie des emails (invitations, alertes).
 */
export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}
