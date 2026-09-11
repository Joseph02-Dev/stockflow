import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID, randomBytes } from 'node:crypto';
import ms from 'ms';
import type { StringValue } from 'ms';
import { PrismaService } from '../../config/prisma.service.js';
import { EMAIL_SERVICE, type EmailService } from '../../common/email/email.service.js';
import { hashToken } from './token-hash.util.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { LogoutDto } from './dto/logout.dto.js';
import type { AcceptInviteDto } from './dto/accept-invite.dto.js';
import type { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import type { ResetPasswordDto } from './dto/reset-password.dto.js';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  utilisateur: { id: string; email: string; nom: string; role: 'ADMIN' | 'GESTIONNAIRE'; photoUrl: string | null };
  entreprise: { id: string; nom: string };
}

// Message volontairement générique : ne jamais révéler si c'est l'email
// ou le mot de passe qui est incorrect (règle de sécurité déjà validée
// en architecture — évite l'énumération des comptes existants).
const IDENTIFIANTS_INVALIDES = 'Email ou mot de passe incorrect.';

// Verrouillage temporaire après plusieurs échecs consécutifs — valeurs
// alignées sur le design de référence ("2 tentatives restantes avant
// blocage temporaire de 15 minutes").
const TENTATIVES_MAX = 5;
const DUREE_BLOCAGE_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Inject(EMAIL_SERVICE) private readonly emailService: EmailService,
  ) {}

  /**
   * AUTH-001-BE — Crée une entreprise et son premier utilisateur (Admin).
   *
   * Règle multi-tenant : cette route est la SEULE à créer une entreprise.
   * Toutes les autres routes de l'application opèrent ensuite dans le
   * périmètre d'une entreprise déjà existante, déduite du token.
   */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const emailExistant = await this.prisma.utilisateur.findUnique({ where: { email: dto.email } });
    if (emailExistant) {
      throw new ConflictException('Un compte existe déjà avec cette adresse email.');
    }

    const passwordHash = await argon2.hash(dto.password);

    const { entreprise, utilisateur } = await this.prisma.$transaction(async (tx) => {
      const entreprise = await tx.entreprise.create({ data: { nom: dto.nomEntreprise } });
      const utilisateur = await tx.utilisateur.create({
        data: {
          entrepriseId: entreprise.id,
          email: dto.email,
          nom: dto.nomAdmin,
          passwordHash,
          role: 'ADMIN',
        },
      });
      return { entreprise, utilisateur };
    });

    return this.construireReponseAuth(utilisateur, entreprise);
  }

  /**
   * AUTH-002 — Connexion.
   * Vérifie les identifiants sans jamais révéler si l'email existe ou non
   * SAUF sur un point assumé : le compte de tentatives restantes et le
   * verrouillage temporaire (demandés explicitrement par le design de
   * référence) ne s'appliquent qu'aux comptes réellement existants —
   * un observateur qui enchaînerait 5 échecs sur un email inexistant ne
   * verrait jamais de blocage, là où il en verrait un sur un email réel.
   * C'est un compromis volontaire (protection anti-bruteforce réelle et
   * visible pour l'utilisateur légitime) plutôt qu'une confidentialité
   * absolue de l'existence du compte — cohérent avec ce que font de
   * nombreux services grand public. Signalé explicitement plutôt que
   * laissé implicite.
   */
  async login(dto: LoginDto): Promise<AuthResult> {
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { email: dto.email } });
    if (!utilisateur) {
      // Aucun compte : pas de compteur à incrémenter, le message reste
      // générique comme toujours.
      throw new UnauthorizedException(IDENTIFIANTS_INVALIDES);
    }

    if (utilisateur.bloqueJusqua && utilisateur.bloqueJusqua > new Date()) {
      const minutesRestantes = Math.ceil((utilisateur.bloqueJusqua.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Compte temporairement bloqué suite à plusieurs échecs. Réessayez dans ${minutesRestantes} minute(s).`,
      );
    }

    const motDePasseValide = await argon2.verify(utilisateur.passwordHash, dto.password);
    if (!motDePasseValide) {
      const tentatives = utilisateur.tentativesEchouees + 1;
      if (tentatives >= TENTATIVES_MAX) {
        await this.prisma.utilisateur.update({
          where: { id: utilisateur.id },
          data: { tentativesEchouees: 0, bloqueJusqua: new Date(Date.now() + DUREE_BLOCAGE_MINUTES * 60000) },
        });
        throw new UnauthorizedException(
          `Trop de tentatives échouées. Compte bloqué pendant ${DUREE_BLOCAGE_MINUTES} minutes.`,
        );
      }
      await this.prisma.utilisateur.update({ where: { id: utilisateur.id }, data: { tentativesEchouees: tentatives } });
      const restantes = TENTATIVES_MAX - tentatives;
      throw new UnauthorizedException(
        `${IDENTIFIANTS_INVALIDES} ${restantes} tentative${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''} avant blocage temporaire de ${DUREE_BLOCAGE_MINUTES} minutes.`,
      );
    }

    // Connexion réussie : on efface toute trace d'échecs précédents.
    if (utilisateur.tentativesEchouees > 0 || utilisateur.bloqueJusqua) {
      await this.prisma.utilisateur.update({
        where: { id: utilisateur.id },
        data: { tentativesEchouees: 0, bloqueJusqua: null },
      });
    }

    const entreprise = await this.prisma.entreprise.findUniqueOrThrow({
      where: { id: utilisateur.entrepriseId },
    });

    return this.construireReponseAuth(utilisateur, entreprise);
  }

  /**
   * AUTH-002 — Déconnexion.
   * Révoque le refresh token fourni côté serveur : il ne pourra plus être
   * utilisé pour obtenir un nouvel access token, même s'il n'est pas
   * encore expiré. L'access token en cours reste valide jusqu'à son
   * expiration naturelle (courte durée, 15 min par défaut).
   */
  async logout(utilisateurId: string, dto: LogoutDto): Promise<{ message: string }> {
    const tokenHash = hashToken(dto.refreshToken);
    const tokenEnregistre = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    // Idempotent et volontairement peu bavard : que le token n'existe pas,
    // appartienne à quelqu'un d'autre, ou soit déjà révoqué, la réponse
    // est la même — pas d'information exploitable pour un attaquant.
    if (tokenEnregistre && tokenEnregistre.utilisateurId === utilisateurId && !tokenEnregistre.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: tokenEnregistre.id },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'Déconnexion réussie.' };
  }

  /**
   * AUTH-003 (suite) — Acceptation d'une invitation.
   * La personne invitée choisit son nom et son mot de passe ; l'entreprise
   * et le rôle proviennent exclusivement de l'invitation (jamais du corps
   * de la requête), pour éviter qu'un utilisateur ne s'auto-attribue un
   * rôle ou une entreprise différente de celle prévue par l'Admin.
   */
  async acceptInvite(dto: AcceptInviteDto): Promise<AuthResult> {
    const tokenHash = hashToken(dto.token);
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash } });

    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      throw new NotFoundException("Invitation invalide, déjà utilisée, ou expirée.");
    }

    const emailDejaUtilise = await this.prisma.utilisateur.findUnique({ where: { email: invitation.email } });
    if (emailDejaUtilise) {
      throw new ConflictException('Un compte existe déjà avec cette adresse email.');
    }

    const passwordHash = await argon2.hash(dto.password);

    const { entreprise, utilisateur } = await this.prisma.$transaction(async (tx) => {
      const utilisateur = await tx.utilisateur.create({
        data: {
          entrepriseId: invitation.entrepriseId,
          email: invitation.email,
          nom: dto.nom,
          passwordHash,
          role: invitation.role,
        },
      });
      await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
      const entreprise = await tx.entreprise.findUniqueOrThrow({ where: { id: invitation.entrepriseId } });
      return { entreprise, utilisateur };
    });

    return this.construireReponseAuth(utilisateur, entreprise);
  }

  /**
   * Demande de réinitialisation. Répond toujours avec le même message de
   * succès, que l'email existe ou non — sinon la réponse elle-même
   * permettrait d'énumérer les comptes existants (même règle que login()).
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { email: dto.email } });

    if (utilisateur) {
      const token = randomBytes(32).toString('hex');
      const expiration = (process.env.PASSWORD_RESET_EXPIRATION ?? '30m') as StringValue;

      await this.prisma.reinitialisationMotDePasse.create({
        data: {
          utilisateurId: utilisateur.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + ms(expiration)),
        },
      });

      const lienBase = process.env.FRONTEND_URL ?? '';
      await this.emailService.send({
        to: utilisateur.email,
        subject: 'Réinitialisation de votre mot de passe StockFlow',
        body: `Une réinitialisation de mot de passe a été demandée pour ce compte.\n\nLien : ${lienBase}/reinitialiser-mot-de-passe?token=${token}\n\nCe lien expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe reste inchangé.`,
      });
    }

    return { message: 'Si un compte existe avec cette adresse, un lien de réinitialisation a été envoyé.' };
  }

  /**
   * Réinitialisation effective. Invalide TOUS les refresh tokens actifs
   * de l'utilisateur : un mot de passe compromis (raison la plus probable
   * d'une réinitialisation) doit aussi révoquer les sessions ouvertes
   * ailleurs, pas seulement empêcher une future connexion avec l'ancien
   * mot de passe.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = hashToken(dto.token);
    const reinitialisation = await this.prisma.reinitialisationMotDePasse.findUnique({ where: { tokenHash } });

    if (!reinitialisation || reinitialisation.usedAt || reinitialisation.expiresAt < new Date()) {
      throw new NotFoundException('Lien de réinitialisation invalide, déjà utilisé, ou expiré.');
    }

    const passwordHash = await argon2.hash(dto.password);

    await this.prisma.$transaction([
      this.prisma.utilisateur.update({
        where: { id: reinitialisation.utilisateurId },
        data: { passwordHash, tentativesEchouees: 0, bloqueJusqua: null },
      }),
      this.prisma.reinitialisationMotDePasse.update({
        where: { id: reinitialisation.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { utilisateurId: reinitialisation.utilisateurId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Mot de passe réinitialisé. Vous pouvez maintenant vous connecter.' };
  }

  private async construireReponseAuth(
    utilisateur: { id: string; email: string; nom: string; role: 'ADMIN' | 'GESTIONNAIRE'; photoUrl: string | null },
    entreprise: { id: string; nom: string },
  ): Promise<AuthResult> {
    const payload = { sub: utilisateur.id, entrepriseId: entreprise.id, role: utilisateur.role };
    const accessToken = this.jwtService.sign({ ...payload, jti: randomUUID() });
    const refreshExpiration = (process.env.JWT_REFRESH_EXPIRATION ?? '7d') as StringValue;
    const refreshToken = this.jwtService.sign(
      { ...payload, jti: randomUUID() },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: refreshExpiration },
    );

    await this.prisma.refreshToken.create({
      data: {
        utilisateurId: utilisateur.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ms(refreshExpiration)),
      },
    });

    return {
      accessToken,
      refreshToken,
      utilisateur: {
        id: utilisateur.id,
        email: utilisateur.email,
        nom: utilisateur.nom,
        role: utilisateur.role,
        photoUrl: utilisateur.photoUrl,
      },
      entreprise: { id: entreprise.id, nom: entreprise.nom },
    };
  }
}
