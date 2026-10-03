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
/**
 * Connexions ouvertes vers PostgreSQL par processus (DB_POOL_MAX, 10 par
 * défaut). Le total (processus × instances × DB_POOL_MAX) doit rester
 * sous le max_connections de la base, en gardant une marge pour les
 * migrations et l'administration.
 */
export function taillePool(): number {
  const valeur = Number(process.env.DB_POOL_MAX ?? 10);
  return Number.isInteger(valeur) && valeur > 0 ? valeur : 10;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: taillePool() }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
