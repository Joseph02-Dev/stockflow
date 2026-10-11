import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { construireDocumentation, documentationActive } from './documentation-api.js';

describe('Documentation OpenAPI', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('active hors production ; en production seulement avec API_DOCS=true', () => {
    expect(documentationActive({ NODE_ENV: 'development' })).toBe(true);
    expect(documentationActive({ NODE_ENV: 'production' })).toBe(false);
    expect(documentationActive({ NODE_ENV: 'production', API_DOCS: 'true' })).toBe(true);
    expect(documentationActive({ NODE_ENV: 'development', API_DOCS: 'false' })).toBe(false);
  });

  it('décrit les routes clientes, protégées par jeton, sans la console opérateur', () => {
    const document = construireDocumentation(app);
    expect(document.paths['/stock/mouvements']?.post).toBeDefined();
    expect(document.paths['/valorisation']?.get).toBeDefined();
    expect(Object.keys(document.paths).some((c) => c.startsWith('/console'))).toBe(false);
    expect(document.security).toEqual([{ bearer: [] }]);
    expect(document.components?.securitySchemes?.bearer).toBeDefined();
  });
});
