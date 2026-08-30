import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Wrapper NestJS autour du client Prisma.
 * Injectable dans n'importe quel module métier via PrismaModule (global).
 * Gère explicitement l'ouverture/fermeture de la connexion avec le cycle
 * de vie de l'application NestJS, pour éviter les connexions orphelines.
 *
 * Prisma 7 exige un adaptateur de driver explicite (plus de connexion
 * implicite depuis une simple chaîne de connexion) — voir @prisma/adapter-pg.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
