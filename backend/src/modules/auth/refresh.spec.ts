import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { configurerApplication } from '../../config/application.js';
import { hashToken } from './token-hash.util.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';

/**
 * POST /auth/refresh — rotation obligatoire et détection de réutilisation.
 * Chaque test crée sa propre entreprise : aucun état partagé entre cas.
 */
describe('Auth — renouvellement de session', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const entrepriseIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configurerApplication(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await nettoyer(prisma, entrepriseIds, []);
    await app.close();
  });

  async function sessionOuverte() {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, 'Entreprise Refresh');
    entrepriseIds.push(entreprise.id);
    const connexion = await connecterClient(app, utilisateur.email);
    expect(connexion.status).toBe(200);
    return { entreprise, utilisateur, refreshToken: connexion.body.refreshToken as string };
  }

  const renouveler = (refreshToken: string) =>
    request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken });

  const tokenEnBase = (refreshToken: string) =>
    prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashToken(refreshToken) } });

  it('un refresh token n’ouvre jamais l’API comme jeton d’accès, même si JWT_REFRESH_SECRET manque', async () => {
    const { refreshToken } = await sessionOuverte();
    const refus = await request(app.getHttpServer()).get('/produits').set('Authorization', `Bearer ${refreshToken}`);
    expect(refus.status).toBe(401);

    // Configuration incomplète (cas réel en production) : la bibliothèque JWT
    // signe alors le refresh token avec le secret d'accès. Il reste refusé.
    const secretRefresh = process.env.JWT_REFRESH_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    try {
      const { refreshToken: signeAvecSecretAcces } = await sessionOuverte();
      const r = await request(app.getHttpServer()).get('/produits').set('Authorization', `Bearer ${signeAvecSecretAcces}`);
      expect(r.status).toBe(401);
    } finally {
      process.env.JWT_REFRESH_SECRET = secretRefresh;
    }
  });

  it('un refresh token valide donne une nouvelle paire, au format de la connexion', async () => {
    const { utilisateur, entreprise, refreshToken } = await sessionOuverte();

    const reponse = await renouveler(refreshToken);

    expect(reponse.status).toBe(200);
    expect(Object.keys(reponse.body).sort()).toEqual(['accessToken', 'entreprise', 'refreshToken', 'utilisateur']);
    expect(reponse.body.refreshToken).not.toBe(refreshToken);
    expect(reponse.body.utilisateur.id).toBe(utilisateur.id);
    expect(reponse.body.entreprise).toEqual({ id: entreprise.id, nom: entreprise.nom });

    // Le nouvel access token ouvre bien les routes protégées.
    const produits = await request(app.getHttpServer())
      .get('/produits')
      .set('Authorization', `Bearer ${reponse.body.accessToken}`);
    expect(produits.status).toBe(200);
  });

  it("révoque en base l'ancien refresh token et enregistre le nouveau", async () => {
    const { refreshToken } = await sessionOuverte();

    const reponse = await renouveler(refreshToken);

    expect((await tokenEnBase(refreshToken)).revokedAt).not.toBeNull();
    const nouveau = await tokenEnBase(reponse.body.refreshToken);
    expect(nouveau.revokedAt).toBeNull();
    expect(nouveau.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("la réutilisation d'un token révoqué révoque toutes les sessions de l'utilisateur", async () => {
    const { utilisateur, refreshToken } = await sessionOuverte();
    // Seconde session du même utilisateur (autre appareil).
    const autreAppareil = (await connecterClient(app, utilisateur.email)).body.refreshToken as string;
    const legitime = (await renouveler(refreshToken)).body.refreshToken as string;

    // Une copie de l'ancien token se présente.
    const rejeu = await renouveler(refreshToken);

    expect(rejeu.status).toBe(401);
    expect(rejeu.body.message).toBe('Session expirée. Veuillez vous reconnecter.');
    const actifs = await prisma.refreshToken.count({ where: { utilisateurId: utilisateur.id, revokedAt: null } });
    expect(actifs).toBe(0);
    expect((await renouveler(legitime)).status).toBe(401);
    expect((await renouveler(autreAppareil)).status).toBe(401);
  });

  it("refuse le renouvellement si l'entreprise est suspendue, sans consommer le token", async () => {
    const { entreprise, refreshToken } = await sessionOuverte();
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { statut: 'SUSPENDUE' } });

    const reponse = await renouveler(refreshToken);

    expect(reponse.status).toBe(403);
    expect(reponse.body.code).toBe('ENTREPRISE_SUSPENDUE');
    expect((await tokenEnBase(refreshToken)).revokedAt).toBeNull();
  });

  it('refuse un refresh token expiré', async () => {
    const { refreshToken } = await sessionOuverte();
    await prisma.refreshToken.update({
      where: { tokenHash: hashToken(refreshToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const reponse = await renouveler(refreshToken);

    expect(reponse.status).toBe(401);
    expect(reponse.body.message).toBe('Session expirée. Veuillez vous reconnecter.');
  });

  it('refuse un token inconnu avec le même message', async () => {
    const reponse = await renouveler('jeton-qui-n-existe-pas');

    expect(reponse.status).toBe(401);
    expect(reponse.body.message).toBe('Session expirée. Veuillez vous reconnecter.');
  });
});
