import { Global, Module } from '@nestjs/common';
import { JwtModule as NestJwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';

/**
 * Encapsule la configuration JWT (secret + expiration) lue depuis les
 * variables d'environnement. Global pour être injectable aussi bien dans
 * TenantContextMiddleware (décodage) que dans le futur AuthModule
 * (émission des tokens au login), sans dupliquer la configuration.
 */
@Global()
@Module({
  imports: [
    NestJwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: {
        expiresIn: (process.env.JWT_ACCESS_EXPIRATION ?? '15m') as StringValue,
      },
    }),
  ],
  exports: [NestJwtModule],
})
export class JwtConfigModule {}
