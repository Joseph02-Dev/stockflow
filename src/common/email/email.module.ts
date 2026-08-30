import { Global, Module, OnModuleInit } from '@nestjs/common';
import { EMAIL_SERVICE } from './email.service.js';
import { DevEmailService } from './dev-email.service.js';

/**
 * Sélectionne l'implémentation du service email selon EMAIL_PROVIDER.
 * Actuellement seul 'dev' est implémenté (voir DevEmailService). Un vrai
 * fournisseur (Resend, SendGrid...) sera ajouté ici avant la mise en
 * production, sans changer le code métier qui dépend de EMAIL_SERVICE.
 *
 * DevEmailService est aussi exporté sous son propre nom (en plus du token
 * EMAIL_SERVICE) pour permettre aux tests d'inspecter les emails "envoyés"
 * via getSentEmails().
 */
@Global()
@Module({
  providers: [DevEmailService, { provide: EMAIL_SERVICE, useExisting: DevEmailService }],
  exports: [EMAIL_SERVICE, DevEmailService],
})
export class EmailModule implements OnModuleInit {
  onModuleInit() {
    const provider = process.env.EMAIL_PROVIDER ?? 'dev';
    if (provider !== 'dev') {
      throw new Error(
        `EMAIL_PROVIDER="${provider}" n'a pas d'implémentation. Seul "dev" est disponible pour l'instant.`,
      );
    }
  }
}
