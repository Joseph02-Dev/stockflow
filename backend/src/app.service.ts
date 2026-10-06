import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './config/prisma.service.js';

/** Au-delà, la base est jugée injoignable : un healthcheck ne doit jamais rester pendu. */
const DELAI_BASE_MS = 3000;

export interface EtatSante {
  statut: 'ok';
  baseDeDonnees: 'ok';
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  /**
   * Santé de l'API : la base PostgreSQL est la seule dépendance sans
   * laquelle aucune requête ne peut aboutir (Redis, facultatif, se replie
   * sur la mémoire ; Cloudinary et l'email ne concernent que certaines
   * actions). Réponse volontairement pauvre : ni hôte, ni message d'erreur,
   * ni version — l'URL est publique.
   */
  async sante(): Promise<EtatSante> {
    let delai: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, rejeter) => {
          delai = setTimeout(() => rejeter(new Error(`pas de réponse en ${DELAI_BASE_MS} ms`)), DELAI_BASE_MS);
        }),
      ]);
      return { statut: 'ok', baseDeDonnees: 'ok' };
    } catch (erreur) {
      // Le détail reste dans les journaux du serveur, jamais dans la réponse.
      this.logger.error(`Base de données injoignable : ${(erreur as Error).message}`);
      throw new ServiceUnavailableException({ statut: 'indisponible', baseDeDonnees: 'injoignable' });
    } finally {
      clearTimeout(delai);
    }
  }
}
