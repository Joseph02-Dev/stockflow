import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import ms from 'ms';
import type { StringValue } from 'ms';
import { PrismaService } from '../../config/prisma.service.js';
import { hashToken } from './token-hash.util.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { LogoutDto } from './dto/logout.dto.js';
import type { AcceptInviteDto } from './dto/accept-invite.dto.js';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  utilisateur: { id: string; email: string; nom: string; role: 'ADMIN' | 'GESTIONNAIRE' };
  entreprise: { id: string; nom: string };
}

// Message volontairement générique : ne jamais révéler si c'est l'email
// ou le mot de passe qui est incorrect (règle de sécurité déjà validée
// en architecture — évite l'énumération des comptes existants).
const IDENTIFIANTS_INVALIDES = 'Email ou mot de passe incorrect.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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
   * Vérifie les identifiants sans jamais révéler si l'email existe ou non.
   */
  async login(dto: LoginDto): Promise<AuthResult> {
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { email: dto.email } });
    if (!utilisateur) {
      throw new UnauthorizedException(IDENTIFIANTS_INVALIDES);
    }

    const motDePasseValide = await argon2.verify(utilisateur.passwordHash, dto.password);
    if (!motDePasseValide) {
      throw new UnauthorizedException(IDENTIFIANTS_INVALIDES);
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

  private async construireReponseAuth(
    utilisateur: { id: string; email: string; nom: string; role: 'ADMIN' | 'GESTIONNAIRE' },
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
      utilisateur: { id: utilisateur.id, email: utilisateur.email, nom: utilisateur.nom, role: utilisateur.role },
      entreprise: { id: entreprise.id, nom: entreprise.nom },
    };
  }
}
