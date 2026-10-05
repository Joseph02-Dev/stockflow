import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestContext } from '../../common/context/tenant-context.service.js';
import { UsersService } from './users.service.js';
import { InviteUserDto } from './dto/invite-user.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { UpdateProfilDto } from './dto/update-profil.dto.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles('ADMIN')
  @Get()
  lister(@CurrentTenant() entrepriseId: string) {
    return this.usersService.lister(entrepriseId);
  }

  // Pas de @Roles('ADMIN') : tout utilisateur authentifié modifie sa
  // propre photo, quel que soit son rôle.
  @Patch('me/photo')
  modifierMaPhoto(@CurrentUser() user: RequestContext, @Body() dto: UpdateProfilDto) {
    return this.usersService.modifierPhoto(user.utilisateurId, dto.photoUrl);
  }

  @Roles('ADMIN')
  @Patch(':id/role')
  modifierRole(
    @CurrentTenant() entrepriseId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.usersService.modifierRole(entrepriseId, id, dto.role);
  }

  /** Retire l'accès d'un employé : compte conservé, sessions coupées immédiatement. */
  @Roles('ADMIN')
  @Post(':id/desactiver')
  @HttpCode(HttpStatus.OK)
  desactiver(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.desactiver(entrepriseId, user.utilisateurId, id);
  }

  @Roles('ADMIN')
  @Post(':id/reactiver')
  @HttpCode(HttpStatus.OK)
  reactiver(@CurrentTenant() entrepriseId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.reactiver(entrepriseId, id);
  }

  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  inviter(
    @CurrentTenant() entrepriseId: string,
    @CurrentUser() user: RequestContext,
    @Body() dto: InviteUserDto,
  ): Promise<{ message: string }> {
    return this.usersService.inviter(entrepriseId, user.utilisateurId, dto);
  }
}
