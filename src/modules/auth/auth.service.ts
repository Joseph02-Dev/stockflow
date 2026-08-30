import { ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { StringValue } from 'ms';
import { PrismaService } from '../../config/prisma.service.js';
import type { RegisterDto } from './dto/register.dto.js';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  utilisateur: { id: string; email: string; nom: string; role: 'ADMIN' | 'GESTIONNAIRE' };
  entreprise: { id: string; nom: string };
}

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

    const tokens = this.emettreTokens({
      sub: utilisateur.id,
      entrepriseId: entreprise.id,
      role: 'ADMIN',
    });

    return {
      ...tokens,
      utilisateur: { id: utilisateur.id, email: utilisateur.email, nom: utilisateur.nom, role: 'ADMIN' },
      entreprise: { id: entreprise.id, nom: entreprise.nom },
    };
  }

  private emettreTokens(payload: {
    sub: string;
    entrepriseId: string;
    role: 'ADMIN' | 'GESTIONNAIRE';
  }): { accessToken: string; refreshToken: string } {
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: (process.env.JWT_REFRESH_EXPIRATION ?? '7d') as StringValue,
    });
    return { accessToken, refreshToken };
  }
}
