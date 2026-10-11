import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../config/prisma.service.js';
import { fonctionnalitesSuspendues } from '../../config/fonctionnalites.js';
import { ReapprovisionnementService } from './reapprovisionnement.service.js';

/**
 * Calcul quotidien du réapprovisionnement, pour chaque entreprise active
 * qui a le module. 5 h (heure de Conakry, UTC+0) : avant l'ouverture des
 * magasins, les brouillons attendent la relecture du matin.
 *
 * Plusieurs instances peuvent tourner en même temps : le verrou
 * consultatif de lancer() laisse une seule d'entre elles calculer chaque
 * entreprise, et le calcul est idempotent de toute façon. Une entreprise
 * en échec n'empêche pas les suivantes.
 */
@Injectable()
export class ReapproPlanificateur {
  private readonly journal = new Logger(ReapproPlanificateur.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reappro: ReapprovisionnementService,
  ) {}

  @Cron('0 5 * * *', { name: 'reapprovisionnement-quotidien', timeZone: 'Africa/Conakry' })
  async calculQuotidien() {
    if (fonctionnalitesSuspendues().includes('reapprovisionnement')) {
      this.journal.warn('Réapprovisionnement suspendu (FONCTIONNALITES_DESACTIVEES) : calcul quotidien ignoré.');
      return;
    }
    const entreprises = await this.prisma.entreprise.findMany({
      where: { moduleReapprovisionnement: true, statut: 'ACTIVE' },
      select: { id: true },
    });
    let commandes = 0;
    for (const { id } of entreprises) {
      try {
        const resultat = await this.reappro.lancer(id, undefined, false);
        commandes += resultat?.commandes.length ?? 0;
      } catch (erreur) {
        this.journal.error(`Réapprovisionnement de l'entreprise ${id} en échec : ${(erreur as Error).message}`);
      }
    }
    this.journal.log(`Réapprovisionnement quotidien : ${entreprises.length} entreprise(s), ${commandes} brouillon(s) créé(s).`);
  }
}
