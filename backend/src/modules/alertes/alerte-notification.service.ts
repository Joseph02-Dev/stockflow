import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { EMAIL_SERVICE, type EmailService } from '../../common/email/email.service.js';

@Injectable()
export class AlerteNotificationService {
  private readonly logger = new Logger(AlerteNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
  ) {}

  /**
   * ALERT-004 — Notifie par email les utilisateurs de l'entreprise qu'une
   * alerte vient d'être déclenchée.
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
    try {
      const destinataires = await this.prisma.utilisateur.findMany({
        where: { entrepriseId },
        select: { email: true },
      });

      const sujet =
        type === 'RUPTURE'
          ? `Rupture de stock : ${produitNom}`
          : `Stock faible : ${produitNom}`;
      const corps =
        type === 'RUPTURE'
          ? `Le produit "${produitNom}" est en rupture de stock (quantité restante : ${quantite}).\n\nConnectez-vous à StockFlow pour enregistrer un réapprovisionnement.`
          : `Le stock du produit "${produitNom}" est passé sous son seuil d'alerte (quantité restante : ${quantite}).\n\nConnectez-vous à StockFlow pour enregistrer un réapprovisionnement.`;

      await Promise.all(
        destinataires.map((destinataire) =>
          this.emailService.send({ to: destinataire.email, subject: sujet, body: corps }),
        ),
      );
    } catch (error) {
      // Volontairement non propagé : le mouvement de stock est déjà
      // enregistré et valide, l'échec d'une notification ne doit pas
      // faire échouer la requête de l'utilisateur.
      this.logger.error(`Échec de l'envoi des notifications d'alerte : ${String(error)}`);
    }
  }
}
