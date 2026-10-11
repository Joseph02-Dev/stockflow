import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/**
 * Documentation OpenAPI de l'API (Swagger) : /docs (interface) et
 * /docs/openapi.json (contrat, pour générer un client ou brancher un
 * outil). Active par défaut hors production ; en production seulement
 * avec API_DOCS=true — une carte complète des routes n'a pas à être
 * publique sans décision explicite. API_DOCS=false la coupe partout.
 */
export function documentationActive(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.API_DOCS === 'true') return true;
  if (env.API_DOCS === 'false') return false;
  return env.NODE_ENV !== 'production';
}

export function construireDocumentation(app: INestApplication): OpenAPIObject {
  const configuration = new DocumentBuilder()
    .setTitle('StockFlow API')
    .setDescription(
      [
        'API de gestion de stock multi-entreprise.',
        '',
        'Authentification : `POST /auth/login` renvoie un `accessToken`, à passer en en-tête `Authorization: Bearer <jeton>`.',
        'Les routes d’un module désactivé répondent `403` avec `code: MODULE_DESACTIVE`.',
        'Montants en francs guinéens (GNF), entiers. Dates en ISO 8601.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, configuration);
  // La console opérateur (secret JWT distinct) n'est pas une API cliente.
  for (const chemin of Object.keys(document.paths)) {
    if (chemin === '/console' || chemin.startsWith('/console/')) delete document.paths[chemin];
  }
  // Chaque route est rangée sous son premier segment (« stock », « ventes »…)
  // et exige le jeton, sauf mention contraire.
  for (const [chemin, operations] of Object.entries(document.paths)) {
    const tag = chemin.split('/').filter(Boolean)[0] ?? 'racine';
    for (const operation of Object.values(operations) as { tags?: string[] }[]) {
      if (operation && typeof operation === 'object' && !operation.tags?.length) operation.tags = [tag];
    }
  }
  document.security = [{ bearer: [] }];
  return document;
}

/**
 * Politique de sécurité des seules pages /docs : l'API répond partout
 * ailleurs avec « default-src 'none' » (aucune page à afficher), qui
 * bloquerait les feuilles de style et le script de Swagger UI.
 */
export const CSP_DOCUMENTATION =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'";

export function configurerDocumentation(app: INestApplication, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!documentationActive(env)) return false;
  app.use('/docs', (_req: unknown, res: { setHeader: (nom: string, valeur: string) => void }, suite: () => void) => {
    res.setHeader('Content-Security-Policy', CSP_DOCUMENTATION);
    suite();
  });
  SwaggerModule.setup('docs', app, () => construireDocumentation(app), {
    jsonDocumentUrl: 'docs/openapi.json',
    customSiteTitle: 'StockFlow API',
  });
  return true;
}
