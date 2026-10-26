import { createECDH } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import webpush from 'web-push';
import { PrismaService } from '../../config/prisma.service.js';

/** Contenu d'une notification push, lu par le service worker (frontend/public/sw.js). */
export interface NotificationPush {
  titre: string;
  corps: string;
  /** Page ouverte au toucher de la notification. */
  url: string;
  /** Une nouvelle notification de même étiquette remplace la précédente. */
  etiquette: string;
}

export interface AbonnementNavigateur {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Services push des navigateurs (Chrome, Edge, Firefox, Safari) : seules
 * adresses acceptées pour un abonnement. Sans cette liste, un compte
 * pourrait faire envoyer par le serveur des requêtes vers n'importe quelle
 * adresse, y compris interne (SSRF).
 */
const SERVICES_PUSH = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

export function endpointAutorise(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'https:' &&
      SERVICES_PUSH.some((domaine) => url.hostname === domaine || url.hostname.endsWith(`.${domaine}`))
    );
  } catch {
    return false;
  }
}

/** « NimbaFlow <alertes@exemple.com> » → « mailto:alertes@exemple.com » ; null si aucune adresse. */
export function contactVapid(expediteur: string | undefined): string | null {
  const adresse = expediteur?.match(/<([^>]+)>/)?.[1] ?? expediteur;
  return adresse && /^[^\s@<>]+@[^\s@<>]+$/.test(adresse.trim()) ? `mailto:${adresse.trim()}` : null;
}

/**
 * Vérifie le couple de clés VAPID ; renvoie le problème, ou null s'il est
 * valable. Une clé publique invalide fait échouer l'abonnement dans le
 * navigateur ; un couple dépareillé fait refuser chaque envoi.
 */
export function problemeClesVapid(publique: string, privee: string): string | null {
  const base64Url = /^[A-Za-z0-9_-]+$/;
  if (!base64Url.test(publique) || !base64Url.test(privee)) {
    return 'caractères inattendus (guillemets, espaces, « Public Key: » copiés avec la clé ?)';
  }
  const octetsPublics = Buffer.from(publique, 'base64url');
  const octetsPrives = Buffer.from(privee, 'base64url');
  if (octetsPublics.length === 32 && octetsPrives.length === 65) return 'clés inversées (VAPID_PUBLIC_KEY contient la clé privée)';
  if (octetsPublics.length !== 65 || octetsPublics[0] !== 4) return 'VAPID_PUBLIC_KEY n’est pas une clé publique VAPID (87 caractères, commence par B)';
  if (octetsPrives.length !== 32) return 'VAPID_PRIVATE_KEY n’est pas une clé privée VAPID (43 caractères)';
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(octetsPrives);
    if (!ecdh.getPublicKey().equals(octetsPublics)) return 'les deux clés ne viennent pas de la même génération';
  } catch {
    return 'VAPID_PRIVATE_KEY invalide';
  }
  return null;
}

/** Durée de conservation par le service push d'une notification non remise (appareil éteint). */
const DUREE_VIE_S = 24 * 3600;
/** À l'arrêt (redéploiement), délai laissé aux envois en cours pour se terminer. */
const DELAI_VIDAGE_MS = 10_000;

/**
 * Notifications push (Web Push, standard des navigateurs, sans Firebase).
 *
 * Configuration (Render) : VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY, générées
 * une fois (`npx web-push generate-vapid-keys`). Le contact déclaré aux
 * services push est l'adresse d'expéditeur des emails (EMAIL_FROM). Sans
 * ces variables, le push est simplement désactivé.
 *
 * Seules les personnes connectées sont prévenues : l'appareil se désabonne
 * à la déconnexion, et l'envoi exige une session encore valable (compte
 * actif, session de connexion ni révoquée ni expirée).
 */
@Injectable()
export class PushService implements OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private readonly enCours = new Set<Promise<void>>();
  private readonly cles: { publique: string; privee: string; contact: string } | null;

  constructor(private readonly prisma: PrismaService) {
    const publique = process.env.VAPID_PUBLIC_KEY?.trim();
    const privee = process.env.VAPID_PRIVATE_KEY?.trim();
    const contact = contactVapid(process.env.EMAIL_FROM);
    const probleme = publique && privee ? problemeClesVapid(publique, privee) : null;
    if (probleme) this.logger.error(`Notifications push désactivées : clés VAPID refusées, ${probleme}.`);
    this.cles = publique && privee && contact && !probleme ? { publique, privee, contact } : null;
  }

  /** Clé publique transmise aux navigateurs pour s'abonner ; null si le push n'est pas configuré. */
  get clePublique(): string | null {
    return this.cles?.publique ?? null;
  }

  /**
   * Enregistre l'appareil. Un même appareil (endpoint) passé à un autre
   * compte change de propriétaire : un seul compte connecté à la fois.
   */
  async abonner(entrepriseId: string, utilisateurId: string, abonnement: AbonnementNavigateur): Promise<void> {
    const donnees = { entrepriseId, utilisateurId, p256dh: abonnement.keys.p256dh, auth: abonnement.keys.auth };
    await this.prisma.abonnementPush.upsert({
      where: { endpoint: abonnement.endpoint },
      create: { endpoint: abonnement.endpoint, ...donnees },
      update: donnees,
    });
  }

  async desabonner(utilisateurId: string, endpoint: string): Promise<void> {
    await this.prisma.abonnementPush.deleteMany({ where: { endpoint, utilisateurId } });
  }

  /**
   * Envoie la notification aux appareils des personnes connectées de
   * l'entreprise. La requête de l'utilisateur n'attend que la lecture des
   * abonnements, jamais les services push. Ne lève jamais.
   */
  async envoyer(entrepriseId: string, notification: NotificationPush, saufUtilisateurId?: string): Promise<void> {
    if (!this.cles) return;
    const { publique, privee, contact } = this.cles;
    try {
      const abonnements = await this.prisma.abonnementPush.findMany({
        where: {
          entrepriseId,
          // Personne à l'origine de l'événement : déjà au courant.
          ...(saufUtilisateurId ? { utilisateurId: { not: saufUtilisateurId } } : {}),
          utilisateur: {
            desactiveAt: null,
            refreshTokens: { some: { revokedAt: null, expiresAt: { gt: new Date() } } },
          },
        },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      });
      const contenu = JSON.stringify(notification);
      for (const a of abonnements) {
        const envoi = webpush
          .sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, contenu, {
            vapidDetails: { subject: contact, publicKey: publique, privateKey: privee },
            TTL: DUREE_VIE_S,
            // Priorité haute : l'appareil en veille est réveillé, comme pour une messagerie.
            urgency: 'high',
          })
          .then(
            () => undefined,
            (erreur: unknown) => this.traiterEchec(a.id, erreur),
          )
          .finally(() => this.enCours.delete(envoi));
        this.enCours.add(envoi);
      }
    } catch (erreur) {
      this.logger.error(`Notifications push non envoyées : ${(erreur as Error).message}`);
    }
  }

  /** Abonnement expiré ou révoqué par le navigateur (404, 410) : retiré. Autre échec : journalisé. */
  private async traiterEchec(id: string, erreur: unknown): Promise<void> {
    if (erreur instanceof webpush.WebPushError && (erreur.statusCode === 404 || erreur.statusCode === 410)) {
      await this.prisma.abonnementPush.deleteMany({ where: { id } }).catch(() => undefined);
      return;
    }
    this.logger.warn(`Notification push non remise : ${(erreur as Error).message}`);
  }

  /** Envois encore en cours (diagnostic, tests). */
  get nombreEnCours(): number {
    return this.enCours.size;
  }

  async onModuleDestroy() {
    if (this.enCours.size === 0) return;
    let minuteur: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.allSettled(this.enCours),
      new Promise((r) => {
        minuteur = setTimeout(r, DELAI_VIDAGE_MS);
      }),
    ]);
    clearTimeout(minuteur);
  }
}
