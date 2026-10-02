import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../app.module.js';
import { configurerApplication } from './application.js';

describe('Configuration HTTP', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configurerApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("expose les en-têtes de sécurité et masque la pile technique", async () => {
    const reponse = await request(app.getHttpServer()).get('/');

    expect(reponse.headers['x-powered-by']).toBeUndefined();
    expect(reponse.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(reponse.headers['content-security-policy']).toContain("default-src 'none'");
    expect(reponse.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(reponse.headers['x-content-type-options']).toBe('nosniff');
    expect(reponse.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(reponse.headers['referrer-policy']).toBe('no-referrer');
  });

  it('refuse un corps JSON de plus de 1 Mo', async () => {
    const reponse = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@exemple.com', password: 'x'.repeat(1_100_000) }));

    expect(reponse.status).toBe(413);
  });
});
