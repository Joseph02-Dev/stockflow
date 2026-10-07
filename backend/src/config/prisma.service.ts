import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
 * migrations et l'administration. Mesure (docs/mesures-performance.md) :
 * de 2 à 20 connexions, aucune différence à 100 utilisateurs ; 10 laisse
 * de la marge aux opérations longues (import, rapports).
 */
export function taillePool(): number {
  const valeur = Number(process.env.DB_POOL_MAX ?? 10);
  return Number.isInteger(valeur) && valeur > 0 ? valeur : 10;
}

const entierPositif = (valeur: string | undefined, defaut: number) => {
  const n = Number(valeur);
  return Number.isInteger(n) && n > 0 ? n : defaut;
};

/**
 * Garde-fous du pool (les défauts du pilote pg n'en ont aucun) :
 * - attente d'une connexion libre bornée à 5 s : pool saturé ou base
 *   injoignable, la requête échoue proprement au lieu de rester pendue ;
 * - requête SQL bornée à 30 s : une requête emballée ne monopolise pas
 *   une connexion (la plus lente mesurée en charge : environ 0,2 s) ;
 * - transaction laissée ouverte sans activité fermée après 60 s : ses
 *   verrous ne bloquent pas les autres ;
 * - application_name : connexions identifiables dans pg_stat_activity.
 */
export function optionsPool(env: NodeJS.ProcessEnv = process.env) {
  return {
    connectionString: env.DATABASE_URL,
    max: taillePool(),
    connectionTimeoutMillis: entierPositif(env.DB_DELAI_CONNEXION_MS, 5_000),
    statement_timeout: entierPositif(env.DB_DELAI_REQUETE_MS, 30_000),
    idle_in_transaction_session_timeout: 60_000,
    application_name: 'stockflow-api',
  };
}

/**
 * Avertissement si ce processus et ses copies (WEB_CONCURRENCY) peuvent
 * ouvrir plus de la moitié des connexions autorisées par la base : le
 * reste doit couvrir une seconde instance, les migrations et
 * l'administration. Null si tout va bien.
 */
export function avertissementConnexions(pool: number, processus: number, maxBase: number): string | null {
  const total = pool * processus;
  if (total * 2 <= maxBase) return null;
  return `Connexions PostgreSQL : ${processus} processus × DB_POOL_MAX ${pool} = ${total}, plus de la moitié du max_connections de la base (${maxBase}). Réduire DB_POOL_MAX ou WEB_CONCURRENCY.`;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg(optionsPool()) });
  }

  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    // Contrôle de dimensionnement, sans jamais bloquer le démarrage.
    try {
      const [{ max_connections }] = await this.$queryRaw<{ max_connections: string }[]>`SHOW max_connections`;
      const processus = Math.max(1, Number(process.env.WEB_CONCURRENCY ?? 1) || 1);
      const avertissement = avertissementConnexions(taillePool(), processus, Number(max_connections));
      if (avertissement) this.logger.warn(avertissement);
    } catch {
      // Lecture impossible (droits restreints) : pas d'avertissement.
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
