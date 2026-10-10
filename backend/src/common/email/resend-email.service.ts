import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nestjs';
import { Resend } from 'resend';
import type { EmailMessage, EmailService } from './email.service.js';

/** Délai maximal d'une tentative : un fournisseur muet ne retient jamais une requête. */
const DELAI_TENTATIVE_MS = 8_000;
/** Pauses avant les nouvelles tentatives (3 tentatives au total). */
const PAUSES_MS = [500, 2_000];

type ClientResend = Pick<Resend, 'emails'>;
type ErreurResend = { name?: string; message?: string; statusCode?: number | null };

/** Adresse journalisable : « j***@domaine.com ». */
export const masquerAdresse = (adresse: string) => adresse.replace(/^(.)[^@]*(@.*)$/, '$1***$2');

/**
 * Transport de production : envoie réellement les emails via Resend.
 *
 * - Délai de 8 s par tentative, avec la requête réellement interrompue.
 * - Jusqu'à 3 tentatives sur les erreurs passagères (limite de débit,
 *   panne du fournisseur, réseau), jamais sur une adresse refusée.
 * - Même clé d'idempotence pour toutes les tentatives d'un message :
 *   Resend n'envoie jamais deux fois le même email.
 * - Échec définitif : journalisé (adresse masquée) et signalé à Sentry,
 *   jamais propagé. Un email qui ne part pas ne doit pas faire échouer
 *   l'inscription, l'invitation ou le mouvement de stock qui l'a déclenché.
 */
@Injectable()
export class ResendEmailService implements EmailService {
  private readonly logger = new Logger(ResendEmailService.name);
  private readonly client: ClientResend;
  private readonly expediteur: string;

  constructor(client?: ClientResend, private readonly pauses: number[] = PAUSES_MS) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!client && !apiKey) {
      throw new Error('RESEND_API_KEY est requis quand EMAIL_PROVIDER=resend.');
    }
    this.client = client ?? new Resend(apiKey);
    this.expediteur = process.env.EMAIL_FROM ?? 'StockFlow <onboarding@resend.dev>';
  }

  async send(message: EmailMessage): Promise<void> {
    const idempotencyKey = randomUUID();
    let derniere: ErreurResend | undefined;
    for (let tentative = 0; tentative <= this.pauses.length; tentative++) {
      if (tentative > 0) await new Promise((r) => setTimeout(r, this.pauses[tentative - 1]));
      derniere = await this.tenter(message, idempotencyKey);
      if (!derniere) return;
      if (!passagere(derniere)) break;
    }
    const motif = derniere?.name ?? 'inconnu';
    this.logger.error(`Échec d'envoi à ${masquerAdresse(message.to)} (${motif}) : ${derniere?.message ?? ''}`);
    Sentry.captureMessage("Échec d'envoi d'un email", {
      level: 'error',
      tags: { fournisseur: 'resend', motif, statut: String(derniere?.statusCode ?? 'aucun') },
      extra: { sujet: message.subject },
    });
  }

  /** Une tentative : aucune erreur, ou l'erreur rencontrée. */
  private async tenter(message: EmailMessage, idempotencyKey: string): Promise<ErreurResend | undefined> {
    try {
      const resultat = await this.client.emails.send(
        {
          from: this.expediteur,
          to: message.to,
          subject: message.subject,
          text: message.body,
          ...(message.html ? { html: message.html } : {}),
        },
        // `signal` est transmis tel quel à fetch par le SDK : la requête est réellement coupée.
        { idempotencyKey, signal: AbortSignal.timeout(DELAI_TENTATIVE_MS) } as { idempotencyKey: string },
      );
      return resultat.error ?? undefined;
    } catch (erreur) {
      return { name: (erreur as Error).name, message: (erreur as Error).message, statusCode: null };
    }
  }
}

/** Erreurs qui méritent une nouvelle tentative : réseau, délai, limite de débit, panne du fournisseur. */
function passagere(erreur: ErreurResend): boolean {
  const statut = erreur.statusCode;
  return statut === null || statut === undefined || statut === 429 || statut >= 500;
}
