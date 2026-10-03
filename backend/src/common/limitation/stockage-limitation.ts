import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
  ThrottlerStorageService,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { Redis } from 'ioredis';

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

/**
 * Compte une requête et dit si la clé est bloquée, en une seule opération
 * atomique côté Redis (aucune course possible entre instances) :
 * fenêtre fixe de `ttl` ms, blocage de `block` ms au-delà de `limit`.
 * Retour : { coups, ms avant fin de fenêtre, bloqué (0/1), ms avant déblocage }.
 */
const SCRIPT_INCREMENT = `
local cleCoups, cleBlocage = KEYS[1], KEYS[2]
local ttl, limite, blocage = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local resteBlocage = redis.call('PTTL', cleBlocage)
if resteBlocage > 0 then
  return { tonumber(redis.call('GET', cleCoups) or (limite + 1)), redis.call('PTTL', cleCoups), 1, resteBlocage }
end
if tonumber(redis.call('GET', cleCoups) or '0') > limite then
  redis.call('DEL', cleCoups)
end
local coups = redis.call('INCR', cleCoups)
if coups == 1 then redis.call('PEXPIRE', cleCoups, ttl) end
local resteFenetre = redis.call('PTTL', cleCoups)
if coups > limite and blocage > 0 then
  redis.call('SET', cleBlocage, '1', 'PX', blocage)
  return { coups, resteFenetre, 1, blocage }
end
return { coups, resteFenetre, 0, 0 }`;

const PREFIXE = 'stockflow:limitation';
/** Une alerte de repli au plus par minute dans les journaux. */
const INTERVALLE_ALERTE_MS = 60_000;

export interface ClientRedisLimitation {
  eval(
    script: string,
    nbCles: number,
    ...args: (string | number)[]
  ): Promise<unknown>;
  quit(): Promise<unknown>;
}

/**
 * Stockage des compteurs de limitation de débit.
 *
 * - Avec REDIS_URL : compteurs dans Redis, PARTAGÉS par toutes les
 *   instances (répliques Railway ou processus du mode multi-cœurs) — sans
 *   cela, chaque instance compte de son côté et la limite réelle est
 *   multipliée par le nombre d'instances.
 * - Sans REDIS_URL (développement, tests, instance unique) : mémoire locale,
 *   comportement identique à avant.
 * - Redis injoignable : repli sur la mémoire locale plutôt que de refuser
 *   tout le trafic. La protection reste active, par instance, le temps
 *   que Redis revienne ; l'incident est journalisé.
 */
@Injectable()
export class StockageLimitation
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly journal = new Logger('Limitation');
  private readonly memoire = new ThrottlerStorageService();
  private derniereAlerte = 0;

  constructor(private readonly redis: ClientRedisLimitation | null) {}

  static depuisEnvironnement(): StockageLimitation {
    const url = process.env.REDIS_URL;
    if (!url) return new StockageLimitation(null);
    const client = new Redis(url, {
      // Une requête HTTP n'attend jamais Redis plus de 300 ms : au-delà, repli.
      commandTimeout: 300,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    client.on('error', () => undefined); // erreurs gérées à chaque appel
    return new StockageLimitation(client);
  }

  get distribue(): boolean {
    return this.redis !== null;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis)
      return this.memoire.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    try {
      const base = `${PREFIXE}:${throttlerName}:${key}`;
      const [coups, resteFenetre, bloque, resteBlocage] =
        (await this.redis.eval(
          SCRIPT_INCREMENT,
          2,
          `${base}:coups`,
          `${base}:blocage`,
          ttl,
          limit,
          blockDuration,
        )) as number[];
      return {
        totalHits: coups,
        timeToExpire: Math.max(0, Math.ceil(resteFenetre / 1000)),
        isBlocked: bloque === 1,
        timeToBlockExpire: Math.max(0, Math.ceil(resteBlocage / 1000)),
      };
    } catch (erreur) {
      if (Date.now() - this.derniereAlerte > INTERVALLE_ALERTE_MS) {
        this.derniereAlerte = Date.now();
        this.journal.warn(
          `Redis injoignable (${(erreur as Error).message}) : limitation de débit repliée sur la mémoire locale de cette instance.`,
        );
      }
      return this.memoire.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }

  async onApplicationShutdown() {
    this.memoire.onApplicationShutdown();
    await this.redis?.quit().catch(() => undefined);
  }
}
