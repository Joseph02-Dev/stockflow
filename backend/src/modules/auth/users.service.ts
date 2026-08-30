import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import ms from 'ms';
import type { StringValue } from 'ms';
import { PrismaService } from '../../config/prisma.service.js';
import { hashToken } from './token-hash.util.js';
import { EMAIL_SERVICE, type EmailService } from '../../common/email/email.service.js';
import type { InviteUserDto } from './dto/invite-user.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
  ) {}

  /**
   * AUTH-003 — Liste les utilisateurs de l'entreprise.
   * `select` explicite : le hash du mot de passe ne doit JAMAIS sortir du
   * serveur, même par inadvertance lors d'un ajout de champ au modèle.
   */
  async lister(entrepriseId: string) {
    return this.prisma.utilisateur.findMany({
      where: { entrepriseId },
      select: { id: true, email: true, nom: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * AUTH-004 — Modifie le rôle d'un utilisateur de l'entreprise.
   *
   * Garde-fou important : on refuse de rétrograder le DERNIER Admin.
   * Sans cette vérification, une entreprise pourrait se retrouver
   * définitivement sans administrateur, donc dans l'incapacité de gérer
   * ses utilisateurs, ses emplacements ou ses paramètres — sans aucun
   * moyen de récupérer l'accès depuis l'application.
   */
  async modifierRole(entrepriseId: string, utilisateurId: string, nouveauRole: 'ADMIN' | 'GESTIONNAIRE') {
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { id: utilisateurId } });
    if (!utilisateur || utilisateur.entrepriseId !== entrepriseId) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    if (utilisateur.role === 'ADMIN' && nouveauRole !== 'ADMIN') {
      const nombreAdmins = await this.prisma.utilisateur.count({
        where: { entrepriseId, role: 'ADMIN' },
      });
      if (nombreAdmins <= 1) {
        throw new ConflictException(
          'Impossible de rétrograder le dernier administrateur : l’entreprise doit toujours en compter au moins un.',
        );
      }
    }

    return this.prisma.utilisateur.update({
      where: { id: utilisateurId },
      data: { role: nouveauRole },
      select: { id: true, email: true, nom: true, role: true, createdAt: true },
    });
  }

  /**
   * AUTH-003 — Un Admin invite un nouvel utilisateur par email + rôle.
   * Aucun Utilisateur n'est créé immédiatement : l'invitation est stockée,
   * un email est envoyé avec un jeton à usage unique, et c'est la personne
   * invitée qui choisit son nom et son mot de passe en l'acceptant.
   */
  async inviter(entrepriseId: string, invitedById: string, dto: InviteUserDto): Promise<{ message: string }> {
    const emailDejaUtilise = await this.prisma.utilisateur.findUnique({ where: { email: dto.email } });
    if (emailDejaUtilise) {
      throw new ConflictException('Un compte existe déjà avec cette adresse email.');
    }

    const invitationActive = await this.prisma.invitation.findFirst({
      where: { email: dto.email, entrepriseId, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (invitationActive) {
      throw new ConflictException('Une invitation est déjà en attente pour cette adresse email.');
    }

    const token = randomBytes(32).toString('hex');
    const expiration = (process.env.INVITATION_EXPIRATION ?? '7d') as StringValue;

    await this.prisma.invitation.create({
      data: {
        entrepriseId,
        email: dto.email,
        role: dto.role,
        tokenHash: hashToken(token),
        invitedById,
        expiresAt: new Date(Date.now() + ms(expiration)),
      },
    });

    await this.emailService.send({
      to: dto.email,
      subject: 'Invitation à rejoindre StockFlow',
      body: `Vous avez été invité(e) à rejoindre une entreprise sur StockFlow avec le rôle ${dto.role}.\n\nJeton d'invitation : ${token}\n\nCe jeton expire dans ${expiration}.`,
    });

    return { message: 'Invitation envoyée.' };
  }
}
