import { Global, Module } from '@nestjs/common';
import { LimitesService } from './limites.service.js';

/** Global : emplacements, produits, invitations et console s'en servent. */
@Global()
@Module({ providers: [LimitesService], exports: [LimitesService] })
export class LimitesModule {}
