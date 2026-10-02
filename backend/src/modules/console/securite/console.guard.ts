import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../config/prisma.service.js';
import { CONSOLE_JWT, TYPE_TOKEN_CONSOLE, secretConsoleUtilisable } from './console-jwt.js';
import type { PayloadConsole } from './console-jwt.js';
import { IS_CONSOLE_PUBLIQUE_KEY } from './console.metadata.js';
import type { RequeteConsole } from './console.decorators.js';

/**
 * Garde de la console opérateur — totalement indépendant du contrôle
 * d'accès client (TenantContextMiddleware + RolesGuard), qui ne s'exécute
 * pas sur /console/*.
 *
 * Exige un token signé avec JWT_CONSOLE_SECRET, portant typ = "console",
 * et dont l'opérateur existe toujours en base. Un token client, signé
 * avec un autre secret, échoue à la vérification de signature : 401.
 */
@Injectable()
export class ConsoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CONSOLE_JWT) private readonly jwtConsole: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const estPublique = this.reflector.getAllAndOverride<boolean>(IS_CONSOLE_PUBLIQUE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (estPublique) return true;

    if (!secretConsoleUtilisable()) {
      throw new UnauthorizedException('Console opérateur non configurée.');
    }

    const requete = context.switchToHttp().getRequest<RequeteConsole>();
    const [schema, token] = (requete.headers.authorization ?? '').split(' ');
    if (schema !== 'Bearer' || !token) {
      throw new UnauthorizedException('Authentification opérateur requise.');
    }

    let payload: PayloadConsole;
    try {
      payload = this.jwtConsole.verify<PayloadConsole>(token);
    } catch {
      throw new UnauthorizedException('Token opérateur invalide ou expiré.');
    }
    // Défense en profondeur : même signé avec le bon secret, un token qui
    // ne se déclare pas « console » n'ouvre rien ici.
    if (payload.typ !== TYPE_TOKEN_CONSOLE || !payload.sub) {
      throw new UnauthorizedException('Token opérateur invalide ou expiré.');
    }

    const operateur = await this.prisma.operateur.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, nom: true },
    });
    if (!operateur) {
      throw new UnauthorizedException('Token opérateur invalide ou expiré.');
    }

    requete.operateur = operateur;
    return true;
  }
}
