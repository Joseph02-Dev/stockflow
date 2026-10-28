import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../config/prisma.service.js';
import {
  CONSOLE_JWT,
  DUREE_JETON_ETAPE,
  TYPE_TOKEN_CONSOLE,
  TYPE_TOKEN_ETAPE,
  secretConsoleUtilisable,
} from './securite/console-jwt.js';
import { genererSecretTotp, urlOtpauth, verifierCodeTotp } from './securite/totp.js';
import { JournalService } from './journal.service.js';
import type { LoginConsoleDto } from './dto/login-console.dto.js';
import type { CodeConsoleDto } from './dto/code-console.dto.js';

const IDENTIFIANTS_INVALIDES = 'Email ou mot de passe incorrect.';
const CODE_INVALIDE = 'Code incorrect ou expiré. Saisissez le code affiché maintenant par l’application.';
const ETAPE_EXPIREE = 'Délai dépassé : reconnectez-vous.';

@Injectable()
export class ConsoleAuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONSOLE_JWT) private readonly jwtConsole: JwtService,
    private readonly journal: JournalService,
  ) {}

  /**
   * Connexion opérateur, première étape : le mot de passe. Même règle de
   * non-divulgation que l'application cliente : message identique que
   * l'email existe ou non. La session ne s'ouvre qu'après le code de
   * double authentification (verifierCode) ; un opérateur pas encore
   * enrôlé reçoit sa clé (QR code) à cette étape.
   */
  async login(dto: LoginConsoleDto) {
    if (!secretConsoleUtilisable()) {
      throw new UnauthorizedException('Console opérateur non configurée.');
    }

    const operateur = await this.prisma.operateur.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!operateur || !(await argon2.verify(operateur.passwordHash, dto.motDePasse))) {
      throw new UnauthorizedException(IDENTIFIANTS_INVALIDES);
    }

    const jetonEtape = this.jwtConsole.sign({ sub: operateur.id, typ: TYPE_TOKEN_ETAPE }, { expiresIn: DUREE_JETON_ETAPE });
    if (operateur.totpActifAt) return { etape: 'CODE' as const, jetonEtape };

    // Pas encore enrôlé : nouvelle clé à chaque tentative, confirmée par le
    // premier code juste. Une clé affichée puis abandonnée ne sert à rien.
    const secret = genererSecretTotp();
    await this.prisma.operateur.update({ where: { id: operateur.id }, data: { totpSecret: secret, totpDernierPas: null } });
    return { etape: 'ENROLEMENT' as const, jetonEtape, secret, otpauth: urlOtpauth(operateur.email, secret) };
  }

  /**
   * Seconde étape : le code à 6 chiffres. Confirme l'enrôlement s'il était
   * en attente, puis ouvre la session (2 h). Le pas de temps du code est
   * enregistré par une écriture conditionnelle : un code déjà utilisé,
   * même par deux requêtes simultanées, n'ouvre qu'une session.
   */
  async verifierCode(dto: CodeConsoleDto, maintenant = new Date()) {
    if (!secretConsoleUtilisable()) {
      throw new UnauthorizedException('Console opérateur non configurée.');
    }
    let sub: string;
    try {
      const payload = this.jwtConsole.verify<{ sub: string; typ: string }>(dto.jetonEtape);
      if (payload.typ !== TYPE_TOKEN_ETAPE || !payload.sub) throw new Error();
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException(ETAPE_EXPIREE);
    }

    const operateur = await this.prisma.operateur.findUnique({ where: { id: sub } });
    if (!operateur?.totpSecret) throw new UnauthorizedException(ETAPE_EXPIREE);
    const pas = verifierCodeTotp(operateur.totpSecret, dto.code, maintenant, operateur.totpDernierPas);
    if (pas === null) throw new UnauthorizedException(CODE_INVALIDE);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.operateur.updateMany({
        where: {
          id: operateur.id,
          totpSecret: operateur.totpSecret,
          OR: [{ totpDernierPas: null }, { totpDernierPas: { lt: pas } }],
        },
        data: { totpDernierPas: pas, totpActifAt: operateur.totpActifAt ?? maintenant, derniereConnexionAt: maintenant },
      });
      if (count !== 1) throw new UnauthorizedException(CODE_INVALIDE);
      await this.journal.inscrire({ operateurId: operateur.id, action: 'CONNEXION' }, tx);
    });

    const accessToken = this.jwtConsole.sign({ sub: operateur.id, typ: TYPE_TOKEN_CONSOLE });
    return {
      accessToken,
      operateur: { id: operateur.id, email: operateur.email, nom: operateur.nom },
    };
  }
}
