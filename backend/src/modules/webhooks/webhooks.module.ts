import { Module } from '@nestjs/common';
import { LivreurWebhooks } from './livreur-webhooks.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, LivreurWebhooks],
})
export class WebhooksModule {}
