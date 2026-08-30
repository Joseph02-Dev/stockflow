import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Module global : PrismaService est disponible dans tous les modules
 * métier (auth, produits, mouvements, ...) sans avoir à réimporter
 * PrismaModule dans chacun d'eux.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
