import { Module } from '@nestjs/common';
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

@Module({
  imports: [PrismaModule, AuthModule, EntrepriseModule, EmplacementsModule, ProduitsModule, FournisseursModule, MouvementsModule, AlertesModule, DashboardModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
