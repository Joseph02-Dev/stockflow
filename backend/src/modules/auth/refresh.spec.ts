import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { configurerApplication } from '../../config/application.js';
import { hashToken } from './token-hash.util.js';
import {
  connecterClient,
  cookieSessionDe,
  creerEntrepriseAvecAdmin,
  MOT_DE_PASSE_TEST,
  nettoyer,
  refreshTokenDe,
} from '../console/console-test.utils.js';

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
    return { entreprise, utilisateur, refreshToken: refreshTokenDe(connexion) };
  }

  const renouveler = (refreshToken: string) =>
    request(app.getHttpServer()).post('/auth/refresh').set('Cookie', `stockflow_refresh=${refreshToken}`);

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
    // Le refresh token n'apparaît jamais dans le corps : seulement dans le cookie httpOnly.
    expect(Object.keys(reponse.body).sort()).toEqual(['accessToken', 'entreprise', 'utilisateur']);
    expect(refreshTokenDe(reponse)).not.toBe(refreshToken);
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
    const nouveau = await tokenEnBase(refreshTokenDe(reponse));
    expect(nouveau.revokedAt).toBeNull();
    expect(nouveau.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("la réutilisation d'un token révoqué révoque toutes les sessions de l'utilisateur", async () => {
    const { utilisateur, refreshToken } = await sessionOuverte();
    // Seconde session du même utilisateur (autre appareil).
    const autreAppareil = refreshTokenDe(await connecterClient(app, utilisateur.email));
    const legitime = refreshTokenDe(await renouveler(refreshToken));

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

  it('le cookie de session est httpOnly, Secure, SameSite=Strict et limité à /auth', async () => {
    const { utilisateur } = await sessionOuverte();
    const connexion = await connecterClient(app, utilisateur.email);

    const cookie = cookieSessionDe(connexion);
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; Secure/i);
    expect(cookie).toMatch(/; SameSite=Strict/i);
    expect(cookie).toMatch(/; Path=\/auth/i);
    expect(cookie).toMatch(/; Max-Age=\d+/i);
    expect(connexion.body.refreshToken).toBeUndefined();
  });

  it('« Rester connecté » décoché : cookie de session, sans durée', async () => {
    const { utilisateur } = await sessionOuverte();
    const connexion = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: utilisateur.email, password: MOT_DE_PASSE_TEST, resterConnecte: false });

    expect(connexion.status).toBe(200);
    expect(cookieSessionDe(connexion)).toBeDefined();
    expect(cookieSessionDe(connexion)).not.toMatch(/Max-Age|Expires/i);
  });

  it('transition : un refresh token encore détenu par le navigateur (corps) est accepté une fois', async () => {
    const { refreshToken } = await sessionOuverte();

    const reponse = await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken });

    expect(reponse.status).toBe(200);
    expect(reponse.body.refreshToken).toBeUndefined();
    expect(refreshTokenDe(reponse)).not.toBe(refreshToken);
    expect((await tokenEnBase(refreshToken)).revokedAt).not.toBeNull();
  });

  it('sans cookie ni token : 401, et le cookie est effacé', async () => {
    const reponse = await request(app.getHttpServer()).post('/auth/refresh');

    expect(reponse.status).toBe(401);
    expect(cookieSessionDe(reponse)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('entreprise suspendue : le cookie est conservé', async () => {
    const { entreprise, refreshToken } = await sessionOuverte();
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { statut: 'SUSPENDUE' } });

    const reponse = await renouveler(refreshToken);

    expect(reponse.status).toBe(403);
    expect(cookieSessionDe(reponse)).toBeUndefined();
  });

  it('la déconnexion révoque le token du cookie et efface le cookie', async () => {
    const { utilisateur } = await sessionOuverte();
    const connexion = await connecterClient(app, utilisateur.email);
    const refreshToken = refreshTokenDe(connexion);

    const sortie = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${connexion.body.accessToken}`)
      .set('Cookie', `stockflow_refresh=${refreshToken}`);

    expect(sortie.status).toBe(200);
    expect((await tokenEnBase(refreshToken)).revokedAt).not.toBeNull();
    expect(cookieSessionDe(sortie)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
