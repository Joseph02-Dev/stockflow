import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { EntrepriseModule } from './modules/entreprise/entreprise.module.js';
import { EmplacementsModule } from './modules/emplacements/emplacements.module.js';
import { ProduitsModule } from './modules/produits/produits.module.js';
import { FournisseursModule } from './modules/fournisseurs/fournisseurs.module.js';
import { MouvementsModule } from './modules/mouvements/mouvements.module.js';
import { AlertesModule } from './modules/alertes/alertes.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { PrismaModule } from './config/prisma.module.js';
import { JwtConfigModule } from './config/jwt.module.js';
import { TenantContextModule } from './common/context/tenant-context.module.js';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware.js';
import { RolesGuard } from './common/guards/roles.guard.js';

@Module({
  imports: [
    JwtConfigModule,
    TenantContextModule,
    PrismaModule,
    AuthModule,
    EntrepriseModule,
    EmplacementsModule,
    ProduitsModule,
    FournisseursModule,
    MouvementsModule,
    AlertesModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: RolesGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Appliqué à toutes les routes : le middleware lui-même décide de ne
    // rien faire en l'absence de token (cf. TenantContextMiddleware).
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
