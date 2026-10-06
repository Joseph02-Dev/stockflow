import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { EntrepriseService } from './entreprise.service.js';
import { UpdateEntrepriseDto } from './dto/update-entreprise.dto.js';
import { fonctionnalitesSuspendues } from '../../config/fonctionnalites.js';

@Controller('entreprise')
export class EntrepriseController {
  constructor(private readonly entrepriseService: EntrepriseService) {}

  // Accessible à tout utilisateur authentifié (Admin ou Gestionnaire) :
  // le nom de l'entreprise est affiché dans la barre supérieure de
  // l'application pour tous, pas seulement pour l'Admin (voir UX validée).
  // Les interrupteurs globaux suspendus y sont joints : l'interface masque
  // ce qui est coupé (le serveur refuse de toute façon).
  @Get()
  async getEntreprise(@CurrentTenant() entrepriseId: string) {
    return { ...(await this.entrepriseService.getEntreprise(entrepriseId)), fonctionnalitesSuspendues: fonctionnalitesSuspendues() };
  }

  @Roles('ADMIN')
  @Patch()
  updateEntreprise(@CurrentTenant() entrepriseId: string, @Body() dto: UpdateEntrepriseDto) {
    return this.entrepriseService.updateEntreprise(entrepriseId, dto);
  }
}
