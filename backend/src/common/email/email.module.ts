import { Global, Module, OnModuleInit } from '@nestjs/common';
import { EMAIL_SERVICE } from './email.service.js';
import { DevEmailService } from './dev-email.service.js';
import { ResendEmailService } from './resend-email.service.js';

/**
 * Sélectionne l'implémentation du service email selon EMAIL_PROVIDER
 * ('dev' journalise seulement, 'resend' envoie réellement via Resend).
 *
 * DevEmailService est aussi exporté sous son propre nom (en plus du token
 * EMAIL_SERVICE) pour permettre aux tests d'inspecter les emails "envoyés"
 * via getSentEmails() — y compris quand EMAIL_PROVIDER=resend en
 * production, DevEmailService reste disponible en injection directe pour
 * les tests qui tournent avec EMAIL_PROVIDER=dev localement.
 */
@Global()
@Module({
  providers: [
    DevEmailService,
    {
      provide: EMAIL_SERVICE,
      useFactory: (devEmailService: DevEmailService) => {
        const provider = process.env.EMAIL_PROVIDER ?? 'dev';
        if (provider === 'resend') return new ResendEmailService();
        if (provider === 'dev') return devEmailService;
        throw new Error(`EMAIL_PROVIDER="${provider}" n'a pas d'implémentation. Valeurs possibles : "dev", "resend".`);
      },
      inject: [DevEmailService],
    },
  ],
  exports: [EMAIL_SERVICE, DevEmailService],
})
export class EmailModule implements OnModuleInit {
  onModuleInit() {
    const provider = process.env.EMAIL_PROVIDER ?? 'dev';
    if (provider === 'resend' && !process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY est requis quand EMAIL_PROVIDER=resend.');
    }
  }
}
