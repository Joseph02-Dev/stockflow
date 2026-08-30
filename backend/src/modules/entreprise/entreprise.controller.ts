import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { EntrepriseService } from './entreprise.service.js';
import { UpdateEntrepriseDto } from './dto/update-entreprise.dto.js';

@Controller('entreprise')
export class EntrepriseController {
  constructor(private readonly entrepriseService: EntrepriseService) {}

  // Accessible à tout utilisateur authentifié (Admin ou Gestionnaire) :
  // le nom de l'entreprise est affiché dans la barre supérieure de
  // l'application pour tous, pas seulement pour l'Admin (voir UX validée).
  @Get()
  getEntreprise(@CurrentTenant() entrepriseId: string) {
    return this.entrepriseService.getEntreprise(entrepriseId);
  }

  @Roles('ADMIN')
  @Patch()
  updateEntreprise(@CurrentTenant() entrepriseId: string, @Body() dto: UpdateEntrepriseDto) {
    return this.entrepriseService.updateEntreprise(entrepriseId, dto);
  }
}
