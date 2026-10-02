import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { configurerApplication } from '../../config/application.js';
import { creerEntrepriseAvecAdmin, nettoyer } from '../../modules/console/console-test.utils.js';
import { LIMITATION_ACTIVE, LIMITES_STRICTES, MESSAGE_TROP_DE_REQUETES } from './limitation.js';

/**
 * La limitation est désactivée en environnement de test (NODE_ENV ===
 * 'test') pour ne pas perturber les autres suites ; ici on la réactive
 * explicitement pour vérifier son comportement. Chaque cas utilise sa
 * propre IP (X-Forwarded-For, pris en compte grâce à trust proxy) : les
 * compteurs ne se mélangent pas.
 */
describe('Limitation de débit', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const entrepriseIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LIMITATION_ACTIVE)
      .useValue(true)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configurerApplication(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await nettoyer(prisma, entrepriseIds, []);
    await app.close();
  });

  const connexion = (ip: string, email: string) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password: 'mauvais-mot-de-passe' });

  async function epuiserConnexions(ip: string, email: string) {
    for (let i = 0; i < LIMITES_STRICTES.connexion.limit; i++) {
      const reponse = await connexion(ip, email);
      expect(reponse.status).toBe(401);
    }
    return connexion(ip, email);
  }

  it('répond 429 au-delà de la limite de connexions', async () => {
    const reponse = await epuiserConnexions('203.0.113.10', 'personne@exemple.com');

    expect(reponse.status).toBe(429);
    // Une autre IP garde son propre compteur.
    expect((await connexion('203.0.113.11', 'personne@exemple.com')).status).toBe(401);
  });

  it("le 429 ne révèle ni le compteur, ni l'existence du compte", async () => {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, 'Entreprise Limitation');
    entrepriseIds.push(entreprise.id);

    const compteExistant = await epuiserConnexions('203.0.113.20', utilisateur.email);
    const compteInconnu = await epuiserConnexions('203.0.113.21', 'inconnu@exemple.com');

    for (const reponse of [compteExistant, compteInconnu]) {
      expect(reponse.status).toBe(429);
      expect(reponse.body).toEqual({ statusCode: 429, message: MESSAGE_TROP_DE_REQUETES });
      const entetes = Object.keys(reponse.headers);
      expect(entetes.filter((nom) => nom.startsWith('x-ratelimit') || nom === 'retry-after')).toEqual([]);
    }
  });
});
