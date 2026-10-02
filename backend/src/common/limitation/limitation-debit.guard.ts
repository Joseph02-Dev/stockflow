import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectThrottlerOptions, InjectThrottlerStorage, ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { LIMITATION_ACTIVE } from './limitation.js';

/**
 * ThrottlerGuard rendu désactivable en environnement de test uniquement
 * (voir LIMITATION_ACTIVE). Le suivi se fait par IP : derrière le proxy de
 * Railway, `trust proxy` (main.ts) fait que req.ip est l'IP du client et
 * non celle du proxy — sans quoi tout le monde partagerait un compteur.
 */
@Injectable()
export class LimitationDebitGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    @Inject(LIMITATION_ACTIVE) private readonly active: boolean,
  ) {
    super(options, storage, reflector);
  }

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return !this.active || super.shouldSkip(context);
  }
}
