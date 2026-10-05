import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { EntrepriseModule } from './modules/entreprise/entreprise.module.js';
import { EmplacementsModule } from './modules/emplacements/emplacements.module.js';
import { ProduitsModule } from './modules/produits/produits.module.js';
import { ImportModule } from './modules/import/import.module.js';
import { FournisseursModule } from './modules/fournisseurs/fournisseurs.module.js';
import { MouvementsModule } from './modules/mouvements/mouvements.module.js';
import { LotsModule } from './modules/lots/lots.module.js';
import { PertesModule } from './modules/pertes/pertes.module.js';
import { RetoursModule } from './modules/retours/retours.module.js';
import { AlertesModule } from './modules/alertes/alertes.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { PrismaModule } from './config/prisma.module.js';
import { JwtConfigModule } from './config/jwt.module.js';
import { TenantContextModule } from './common/context/tenant-context.module.js';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { EntrepriseActiveGuard } from './common/guards/entreprise-active.guard.js';
import { EmailModule } from './common/email/email.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { MarquesModule } from './modules/marques/marques.module.js';
import { UploadsModule } from './modules/uploads/uploads.module.js';
import { InventairesModule } from './modules/inventaires/inventaires.module.js';
import { CommandesModule } from './modules/commandes/commandes.module.js';
import { ClientsModule } from './modules/clients/clients.module.js';
import { VentesModule } from './modules/ventes/ventes.module.js';
import { ConsoleModule } from './modules/console/console.module.js';
import { LimitesModule } from './common/limites/limites.module.js';
import { ThrottlerModule } from '@nestjs/throttler';
import { LimitationDebitGuard } from './common/limitation/limitation-debit.guard.js';
import { StockageLimitation } from './common/limitation/stockage-limitation.js';
import {
  LIMITATION_ACTIVE,
  LIMITE_GLOBALE,
  LIMITEUR,
  MESSAGE_TROP_DE_REQUETES,
} from './common/limitation/limitation.js';

@Module({
  imports: [
    // Compteurs dans Redis si REDIS_URL est défini (partagés par toutes les
    // instances), sinon en mémoire locale — voir StockageLimitation.
    // Fabrique : un stockage neuf par application (tests isolés).
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ name: LIMITEUR, ...LIMITE_GLOBALE }],
        errorMessage: MESSAGE_TROP_DE_REQUETES,
        // Pas d'en-têtes X-RateLimit-* : ils révéleraient le compteur restant.
        setHeaders: false,
        storage: StockageLimitation.depuisEnvironnement(),
      }),
    }),
    JwtConfigModule,
    TenantContextModule,
    EmailModule,
    LimitesModule,
    PrismaModule,
    AuthModule,
    EntrepriseModule,
    EmplacementsModule,
    ImportModule,
    ProduitsModule,
    FournisseursModule,
    MouvementsModule,
    LotsModule,
    PertesModule,
    RetoursModule,
    AlertesModule,
    DashboardModule,
    CategoriesModule,
    MarquesModule,
    UploadsModule,
    InventairesModule,
    ClientsModule,
    VentesModule,
    CommandesModule,
    ConsoleModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: LIMITATION_ACTIVE, useValue: process.env.NODE_ENV !== 'test' },
    // En premier : une rafale est coupée avant toute vérification de
    // token ou lecture en base.
    { provide: APP_GUARD, useClass: LimitationDebitGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Après RolesGuard (ordre d'exécution = ordre de déclaration) : une
    // requête non authentifiée reçoit d'abord son 401.
    { provide: APP_GUARD, useClass: EntrepriseActiveGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Appliqué à toutes les routes : le middleware lui-même décide de ne
    // rien faire en l'absence de token (cf. TenantContextMiddleware).
    // Seule exception : la console opérateur, qui a son propre secret JWT
    // et sa propre garde. Sans cette exclusion, tout token opérateur y
    // serait rejeté par le middleware client (mauvais secret).
    consumer
      .apply(TenantContextMiddleware)
      .exclude({ path: 'console', method: RequestMethod.ALL }, { path: 'console/{*chemin}', method: RequestMethod.ALL })
      .forRoutes('*');
  }
}
