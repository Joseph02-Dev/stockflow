import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  entrepriseId: string;
  utilisateurId: string;
  role: 'ADMIN' | 'GESTIONNAIRE';
}

/**
 * Porte le contexte de la requête courante (entreprise, utilisateur, rôle)
 * de façon transversale, sans avoir à le faire transiter explicitement en
 * paramètre à travers chaque service.
 *
 * Rempli par TenantContextMiddleware au tout début de la requête, à partir
 * du JWT décodé. C'est la pièce centrale de l'isolation multi-tenant :
 * l'entreprise_id ne provient JAMAIS d'une valeur envoyée par le client
 * (body, query, params) — toujours de ce contexte, lui-même dérivé du token.
 *
 * Ne contient aucune donnée persistante : réinitialisé à chaque requête.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  /**
   * Retourne le contexte de la requête courante, ou `undefined` si aucun
   * utilisateur authentifié n'est associé à cette requête (route publique,
   * ou requête non encore passée par le middleware).
   */
  getContext(): RequestContext | undefined {
    return this.storage.getStore();
  }

  /**
   * Raccourci pratique — lève une erreur explicite si appelé en dehors
   * d'un contexte authentifié, plutôt que de retourner silencieusement
   * `undefined` et de risquer une requête non filtrée par entreprise.
   */
  requireEntrepriseId(): string {
    const context = this.getContext();
    if (!context) {
      throw new Error(
        'TenantContextService.requireEntrepriseId() appelé en dehors de tout contexte authentifié.',
      );
    }
    return context.entrepriseId;
  }
}
