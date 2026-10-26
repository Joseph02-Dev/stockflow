import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { EMAIL_SERVICE, type EmailService } from '../../common/email/email.service.js';
import { adresseSite, composerEmail } from '../../common/email/gabarit-email.js';
import { emettreEvenement } from '../webhooks/emission.js';
import { PushService } from '../notifications/push.service.js';

@Injectable()
export class AlerteNotificationService {
  private readonly logger = new Logger(AlerteNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
    private readonly push: PushService,
  ) {}

  /**
   * ALERT-004 — Notifie les utilisateurs de l'entreprise qu'une alerte
   * vient d'être déclenchée : notification push sur les appareils où ils
   * sont connectés (avec le son du téléphone, même en veille), et email.
   *
   * Appelé APRÈS la transaction du mouvement, jamais à l'intérieur : un
   * échec d'envoi d'email ne doit jamais annuler un mouvement de stock
   * déjà validé (risque identifié en analyse d'architecture). Les erreurs
   * sont donc journalisées, pas propagées.
   */
  async notifierAlerte(
    entrepriseId: string,
    produitNom: string,
    type: 'STOCK_FAIBLE' | 'RUPTURE',
    quantite: number,
  ): Promise<void> {
    // Webhook « alerte.stock » (module « webhooks ») : écrit en base avant
    // l'email, livré ensuite par LivreurWebhooks. Jamais propagé non plus.
    try {
      await emettreEvenement(this.prisma, entrepriseId, 'alerte.stock', { type, produit: { nom: produitNom }, quantite });
    } catch (error) {
      this.logger.error(`Événement webhook « alerte.stock » non enregistré : ${(error as Error).message}`);
    }

    // Notification push : ne lève jamais (PushService.envoyer).
    await this.push.envoyer(entrepriseId, {
      titre: type === 'RUPTURE' ? 'Rupture de stock' : 'Stock faible',
      corps:
        type === 'RUPTURE'
          ? `${produitNom} est en rupture de stock.`
          : `${produitNom} passe sous son seuil d'alerte (reste ${quantite}).`,
      url: '/alertes',
      etiquette: `alerte-${type}-${produitNom}`,
    });

    try {
      const [destinataires, entreprise] = await Promise.all([
        this.prisma.utilisateur.findMany({ where: { entrepriseId, desactiveAt: null }, select: { email: true } }),
        this.prisma.entreprise.findUniqueOrThrow({ where: { id: entrepriseId }, select: { nom: true } }),
      ]);

      const rupture = type === 'RUPTURE';
      const sujet = rupture ? `Rupture de stock : ${produitNom}` : `Stock faible : ${produitNom}`;
      const contenu = composerEmail({
        apercu: rupture ? `${produitNom} n'est plus disponible.` : `${produitNom} passe sous son seuil d'alerte.`,
        titre: rupture ? 'Rupture de stock' : 'Stock sous le seuil d’alerte',
        paragraphes: [
          rupture
            ? `Le produit « ${produitNom} » est en rupture de stock.`
            : `Le stock du produit « ${produitNom} » est passé sous son seuil d'alerte.`,
          'Enregistrez un réapprovisionnement ou passez une commande au fournisseur pour éviter de manquer des ventes.',
        ],
        details: [
          { libelle: 'Produit', valeur: produitNom },
          { libelle: 'Quantité restante', valeur: String(quantite) },
        ],
        bouton: { libelle: 'Voir les alertes', url: `${adresseSite()}/alertes` },
        mentions: [`Vous recevez cet email car vous êtes membre de ${entreprise.nom} sur NimbaFlow.`],
      });

      await Promise.all(
        destinataires.map((destinataire) => this.emailService.send({ to: destinataire.email, subject: sujet, ...contenu })),
      );
    } catch (error) {
      // Volontairement non propagé : le mouvement de stock est déjà
      // enregistré et valide, l'échec d'une notification ne doit pas
      // faire échouer la requête de l'utilisateur.
      this.logger.error(`Échec de l'envoi des notifications d'alerte : ${String(error)}`);
    }
  }
}
