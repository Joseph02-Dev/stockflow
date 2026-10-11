import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';
import { FOURNISSEUR_IA } from './fournisseur-ia.js';
import { FournisseurAnthropic } from './fournisseur-anthropic.js';
import { OutilsAssistantService } from './outils-assistant.js';
import { QuotaAssistant } from './quota-assistant.js';

@Module({
  controllers: [AssistantController],
  providers: [
    AssistantService,
    OutilsAssistantService,
    QuotaAssistant,
    {
      // Clé lue au démarrage, côté serveur uniquement ; absente : assistant indisponible (503).
      provide: FOURNISSEUR_IA,
      useFactory: () =>
        new FournisseurAnthropic({ cle: process.env.ANTHROPIC_API_KEY?.trim(), modele: process.env.ASSISTANT_MODELE?.trim() }),
    },
  ],
})
export class AssistantModule {}
