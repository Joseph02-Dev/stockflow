import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID, randomBytes } from 'node:crypto';
import ms from 'ms';
import type { StringValue } from 'ms';
import { PrismaService } from '../../config/prisma.service.js';
import { EMAIL_SERVICE, type EmailService } from '../../common/email/email.service.js';
import { domaineEmailExiste } from '../../common/email/domaine-email.util.js';
import { composerEmail } from '../../common/email/gabarit-email.js';
import { hashToken } from './token-hash.util.js';
import { erreurCompteDesactive } from '../../common/compte-desactive.js';
import { erreurEntrepriseSuspendue } from '../../common/entreprise-suspendue.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { LogoutDto } from './dto/logout.dto.js';
import type { RefreshDto } from './dto/refresh.dto.js';
import type { AcceptInviteDto } from './dto/accept-invite.dto.js';
import type { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import type { ResetPasswordDto } from './dto/reset-password.dto.js';
import type { VerifyEmailDto } from './dto/verify-email.dto.js';
import type { ResendVerificationDto } from './dto/resend-verification.dto.js';

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

// Réponse unique à tout refus de renouvellement (inconnu, expiré,
// révoqué, réutilisé) : rien ne distingue les cas pour qui les observe.
const SESSION_EXPIREE = 'Session expirée. Veuillez vous reconnecter.';

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
   *
   * Double opt-in (décision validée) : le compte est créé mais reste
   * inactif — login() le refusera — tant que la personne n'a pas cliqué
   * le lien reçu par email. Ne retourne donc plus de tokens directement,
   * contrairement à avant.
   */
  async register(dto: RegisterDto): Promise<{ message: string }> {
    const emailExistant = await this.prisma.utilisateur.findUnique({ where: { email: dto.email } });
    if (emailExistant) {
      throw new ConflictException('Un compte existe déjà avec cette adresse email.');
    }

    const domaineValide = await domaineEmailExiste(dto.email);
    if (!domaineValide) {
      throw new BadRequestException("Cette adresse email semble invalide : son domaine n'accepte pas de courrier.");
    }

    const passwordHash = await argon2.hash(dto.password);

    const utilisateur = await this.prisma.$transaction(async (tx) => {
      const entreprise = await tx.entreprise.create({ data: { nom: dto.nomEntreprise } });
      return tx.utilisateur.create({
        data: {
          entrepriseId: entreprise.id,
          email: dto.email,
          nom: dto.nomAdmin,
          passwordHash,
          role: 'ADMIN',
        },
      });
    });

    await this.envoyerEmailVerification(utilisateur.id, utilisateur.email);

    return {
      message: 'Compte créé. Vérifiez votre boîte mail pour activer votre accès.',
    };
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

    // Mot de passe juste mais accès retiré : on le dit (la personne a
    // prouvé son identité, aucune information n'est divulguée à un tiers).
    if (utilisateur.desactiveAt) throw erreurCompteDesactive();

    // Connexion réussie : on efface toute trace d'échecs précédents.
    if (utilisateur.tentativesEchouees > 0 || utilisateur.bloqueJusqua) {
      await this.prisma.utilisateur.update({
        where: { id: utilisateur.id },
        data: { tentativesEchouees: 0, bloqueJusqua: null },
      });
    }

    // Vérifié après le mot de passe (pas avant) : un compte non vérifié
    // ne doit pas être une information exploitable par quelqu'un qui n'a
    // pas le bon mot de passe.
    if (!utilisateur.emailVerifieAt) {
      throw new UnauthorizedException(
        'Confirmez votre adresse email avant de vous connecter — vérifiez votre boîte mail.',
      );
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
   * Renouvellement de session à partir d'un refresh token.
   *
   * Rotation obligatoire : le token présenté est révoqué et une nouvelle
   * paire (access + refresh) est émise — chaque refresh token ne sert
   * qu'une fois. Détection de réutilisation : un token déjà révoqué qui
   * se présente signifie qu'il a été copié (le client légitime l'a déjà
   * échangé) ; on révoque alors toutes les sessions actives de
   * l'utilisateur, ce qui coupe aussi l'accès de la copie.
   *
   * Mêmes conditions que la connexion : compte existant, email vérifié,
   * entreprise non suspendue (403 ENTREPRISE_SUSPENDUE, comme au login).
   */
  async refresh(dto: RefreshDto): Promise<AuthResult> {
    const tokenEnregistre = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(dto.refreshToken) },
    });
    if (!tokenEnregistre) {
      throw new UnauthorizedException(SESSION_EXPIREE);
    }
    if (tokenEnregistre.revokedAt) {
      await this.revoquerToutesLesSessions(tokenEnregistre.utilisateurId);
      throw new UnauthorizedException(SESSION_EXPIREE);
    }
    if (tokenEnregistre.expiresAt <= new Date()) {
      throw new UnauthorizedException(SESSION_EXPIREE);
    }

    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: tokenEnregistre.utilisateurId },
      include: { entreprise: true },
    });
    if (!utilisateur || !utilisateur.emailVerifieAt) {
      throw new UnauthorizedException(SESSION_EXPIREE);
    }
    // Compte désactivé : toutes ses sessions sont coupées, sans retour.
    if (utilisateur.desactiveAt) {
      await this.revoquerToutesLesSessions(utilisateur.id);
      throw erreurCompteDesactive();
    }
    // Vérifiée avant la rotation : le token n'est pas consommé par un
    // refus, la personne retrouvera sa session si l'accès est rétabli.
    if (utilisateur.entreprise.statut === 'SUSPENDUE') {
      throw erreurEntrepriseSuspendue();
    }

    // Révocation conditionnelle : si deux requêtes présentent le même
    // token au même instant, une seule le consomme ; l'autre est traitée
    // comme une réutilisation.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: tokenEnregistre.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      await this.revoquerToutesLesSessions(utilisateur.id);
      throw new UnauthorizedException(SESSION_EXPIREE);
    }

    return this.construireReponseAuth(utilisateur, utilisateur.entreprise);
  }

  private async revoquerToutesLesSessions(utilisateurId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { utilisateurId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
          // Recevoir l'invitation à cette adresse ET fournir le jeton
          // qu'elle contenait prouve déjà la possession de la boîte —
          // inutile de redemander une confirmation par email.
          emailVerifieAt: new Date(),
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
    const domaineValide = await domaineEmailExiste(dto.email);
    if (!domaineValide) {
      throw new BadRequestException("Cette adresse email semble invalide : son domaine n'accepte pas de courrier.");
    }

    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email: dto.email },
      include: { entreprise: { select: { statut: true } } },
    });

    // Entreprise suspendue : aucun email ne part (la suspension promet que
    // les emails cessent), mais la réponse reste identique pour ne rien
    // révéler à qui ne connaît que l'adresse.
    if (utilisateur && utilisateur.entreprise.statut !== 'SUSPENDUE') {
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

  /**
   * Confirmation du clic sur le lien reçu par email — active le compte et
   * connecte directement la personne (évite un aller-retour supplémentaire
   * vers l'écran de connexion juste après avoir prouvé qui elle est).
   */
  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResult> {
    const tokenHash = hashToken(dto.token);
    const verification = await this.prisma.verificationEmail.findUnique({ where: { tokenHash } });

    if (!verification || verification.usedAt || verification.expiresAt < new Date()) {
      throw new NotFoundException('Lien de confirmation invalide, déjà utilisé, ou expiré.');
    }

    const { utilisateur, entreprise } = await this.prisma.$transaction(async (tx) => {
      const utilisateur = await tx.utilisateur.update({
        where: { id: verification.utilisateurId },
        data: { emailVerifieAt: new Date() },
      });
      await tx.verificationEmail.update({ where: { id: verification.id }, data: { usedAt: new Date() } });
      const entreprise = await tx.entreprise.findUniqueOrThrow({ where: { id: utilisateur.entrepriseId } });
      return { utilisateur, entreprise };
    });

    return this.construireReponseAuth(utilisateur, entreprise);
  }

  /**
   * Renvoi du lien de confirmation. Même principe de non-fuite que
   * forgotPassword() : réponse identique que le compte existe, soit déjà
   * vérifié, soit inconnu.
   */
  async resendVerification(dto: ResendVerificationDto): Promise<{ message: string }> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { email: dto.email },
      include: { entreprise: { select: { statut: true } } },
    });
    if (utilisateur && !utilisateur.emailVerifieAt && utilisateur.entreprise.statut !== 'SUSPENDUE') {
      await this.envoyerEmailVerification(utilisateur.id, utilisateur.email);
    }
    return { message: 'Si un compte en attente de confirmation existe, un nouveau lien vient d’être envoyé.' };
  }

  private async envoyerEmailVerification(utilisateurId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString('hex');
    const expiration = (process.env.EMAIL_VERIFICATION_EXPIRATION ?? '24h') as StringValue;

    await this.prisma.verificationEmail.create({
      data: {
        utilisateurId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ms(expiration)),
      },
    });

    const lienBase = process.env.FRONTEND_URL ?? '';
    await this.emailService.send({
      to: email,
      subject: 'Confirmez votre adresse email StockFlow',
      ...composerEmail({
        apercu: 'Un clic pour activer votre compte et terminer la création de votre espace.',
        titre: 'Bienvenue sur StockFlow',
        paragraphes: [
          'Merci pour votre inscription. Confirmez votre adresse email pour activer votre compte.',
          'Vous serez ensuite redirigé vers StockFlow pour terminer la configuration de votre entreprise.',
        ],
        bouton: { libelle: 'Confirmer mon adresse email', url: `${lienBase}/verifier-email?token=${token}` },
        mentions: [
          `Ce lien est personnel et expire dans ${expiration === '24h' ? '24 heures' : expiration}.`,
          "Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email : aucun compte ne sera activé.",
        ],
      }),
    });
  }

  private async construireReponseAuth(
    utilisateur: { id: string; email: string; nom: string; role: 'ADMIN' | 'GESTIONNAIRE'; photoUrl: string | null },
    entreprise: { id: string; nom: string; statut: 'ACTIVE' | 'SUSPENDUE' },
  ): Promise<AuthResult> {
    // Point de passage obligé de toute émission de tokens (connexion,
    // invitation acceptée, email confirmé). Dans login(), il n'est atteint
    // qu'après la vérification du mot de passe : une suspension ne se
    // révèle jamais à qui n'a pas les bons identifiants.
    if (entreprise.statut === 'SUSPENDUE') {
      throw erreurEntrepriseSuspendue();
    }

    const payload = { sub: utilisateur.id, entrepriseId: entreprise.id, role: utilisateur.role };
    // Type explicite : un jeton de renouvellement n'est jamais accepté comme
    // jeton d'accès (TenantContextMiddleware), quel que soit son secret.
    const accessToken = this.jwtService.sign({ ...payload, typ: 'access', jti: randomUUID() });
    const refreshExpiration = (process.env.JWT_REFRESH_EXPIRATION ?? '7d') as StringValue;
    const refreshToken = this.jwtService.sign(
      { ...payload, typ: 'refresh', jti: randomUUID() },
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
