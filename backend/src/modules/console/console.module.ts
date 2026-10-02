import { Module } from '@nestjs/common';
import { ConsoleAuthController } from './console-auth.controller.js';
import { ConsoleAuthService } from './console-auth.service.js';
import { ConsoleEntreprisesController } from './console-entreprises.controller.js';
import { ConsoleEntreprisesService } from './console-entreprises.service.js';
import { JournalService } from './journal.service.js';
import { ConsoleGuard } from './securite/console.guard.js';
import { consoleJwtProvider } from './securite/console-jwt.js';

/**
 * Console opérateur — le seul module qui traverse volontairement
 * l'isolation multi-tenant. Authentification, garde et JwtService propres ;
 * n'importe ni CurrentTenant ni TenantContextService. Lecture seule sur
 * les données métier : il consulte, il suspend, rien d'autre.
 */
@Module({
  controllers: [ConsoleAuthController, ConsoleEntreprisesController],
  providers: [consoleJwtProvider, ConsoleGuard, JournalService, ConsoleAuthService, ConsoleEntreprisesService],
})
export class ConsoleModule {}
