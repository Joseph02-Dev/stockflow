import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../config/prisma.service.js';
import { CONSOLE_JWT, TYPE_TOKEN_CONSOLE, secretConsoleUtilisable } from './securite/console-jwt.js';
import { JournalService } from './journal.service.js';
import type { LoginConsoleDto } from './dto/login-console.dto.js';

const IDENTIFIANTS_INVALIDES = 'Email ou mot de passe incorrect.';

@Injectable()
export class ConsoleAuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONSOLE_JWT) private readonly jwtConsole: JwtService,
    private readonly journal: JournalService,
  ) {}

  /**
   * Connexion opérateur. Même règle de non-divulgation que l'application
   * cliente : message identique que l'email existe ou non. Pas de refresh
   * token en phase 1 : la session expire (2 h par défaut) et l'opérateur
   * se reconnecte — chaque connexion est ainsi tracée au journal.
   */
  async login(dto: LoginConsoleDto) {
    if (!secretConsoleUtilisable()) {
      throw new UnauthorizedException('Console opérateur non configurée.');
    }

    const operateur = await this.prisma.operateur.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!operateur || !(await argon2.verify(operateur.passwordHash, dto.motDePasse))) {
      throw new UnauthorizedException(IDENTIFIANTS_INVALIDES);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.operateur.update({ where: { id: operateur.id }, data: { derniereConnexionAt: new Date() } });
      await this.journal.inscrire({ operateurId: operateur.id, action: 'CONNEXION' }, tx);
    });

    const accessToken = this.jwtConsole.sign({ sub: operateur.id, typ: TYPE_TOKEN_CONSOLE });
    return {
      accessToken,
      operateur: { id: operateur.id, email: operateur.email, nom: operateur.nom },
    };
  }
}
