import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Fonctionnalite } from '../../common/decorators/fonctionnalite.decorator.js';
import { ModuleRequis } from '../../common/decorators/module-requis.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { LIMITES_STRICTES, LimiteStricte } from '../../common/limitation/limitation.js';
import { AssistantService } from './assistant.service.js';
import { ChatDto } from './dto/chat.dto.js';

/** Assistant IA en lecture seule (module « assistant »), ouvert aux deux rôles. */
@ModuleRequis('assistant')
@Fonctionnalite('assistant')
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @LimiteStricte(LIMITES_STRICTES.assistant)
  discuter(@CurrentUser() utilisateur: RequestContext, @Body() dto: ChatDto) {
    return this.assistant.discuter(utilisateur, dto);
  }
}
