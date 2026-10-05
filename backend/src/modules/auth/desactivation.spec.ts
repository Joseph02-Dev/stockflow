import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { MOT_DE_PASSE_TEST, connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';

/**
 * Révocation immédiate des droits : désactivation d'un compte et
 * rétrogradation d'un administrateur prennent effet dès la requête
 * suivante, même avec un access token encore valide.
 */
describe('Désactivation et révocation immédiate des droits — intégration réelle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const entrepriseIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await nettoyer(prisma, entrepriseIds, []);
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const avec = (token: string) => ({
    get: (url: string) => http().get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, corps: object = {}) => http().post(url).set('Authorization', `Bearer ${token}`).send(corps),
    patch: (url: string, corps: object = {}) => http().patch(url).set('Authorization', `Bearer ${token}`).send(corps),
  });

  async function membre(entrepriseId: string, role: 'ADMIN' | 'GESTIONNAIRE') {
    const email = `membre-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    const u = await prisma.utilisateur.create({
      data: { entrepriseId, email, nom: `Membre ${role}`, passwordHash: await argon2.hash(MOT_DE_PASSE_TEST), role, emailVerifieAt: new Date() },
    });
    const connexion = await connecterClient(app, email);
    return { id: u.id, email, token: connexion.body.accessToken as string, refresh: connexion.body.refreshToken as string };
  }

  async function equipe(nom = 'Ets Camara & Frères') {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, nom);
    entrepriseIds.push(entreprise.id);
    const admin = avec((await connecterClient(app, utilisateur.email)).body.accessToken);
    return { entrepriseId: entreprise.id, adminId: utilisateur.id, admin };
  }

  it('un compte désactivé perd l’accès à la requête suivante : token, renouvellement et connexion refusés', async () => {
    const e = await equipe();
    const gest = await membre(e.entrepriseId, 'GESTIONNAIRE');
    expect((await avec(gest.token).get('/produits')).status).toBe(200);

    const r = await e.admin.post(`/users/${gest.id}/desactiver`);
    expect(r.status).toBe(200);
    expect(r.body.desactiveAt).not.toBeNull();
    expect(r.body).not.toHaveProperty('passwordHash');

    // Access token encore valide (15 min) : refusé immédiatement.
    const apres = await avec(gest.token).get('/produits');
    expect(apres.status).toBe(403);
    expect(apres.body.code).toBe('COMPTE_DESACTIVE');
    // Toutes ses sessions sont révoquées.
    expect(await prisma.refreshToken.count({ where: { utilisateurId: gest.id, revokedAt: null } })).toBe(0);
    const renouvellement = await http().post('/auth/refresh').send({ refreshToken: gest.refresh });
    expect(renouvellement.status).toBeGreaterThanOrEqual(401);
    // Connexion : le bon mot de passe ne suffit plus.
    const connexion = await http().post('/auth/login').send({ email: gest.email, password: MOT_DE_PASSE_TEST });
    expect(connexion.status).toBe(403);
    expect(connexion.body.code).toBe('COMPTE_DESACTIVE');

    // Le compte est conservé (historique), marqué et listé comme tel.
    const liste = await e.admin.get('/users');
    expect(liste.body.find((u: { id: string }) => u.id === gest.id)).toMatchObject({ desactivePar: { nom: expect.any(String) } });
  });

  it('réactivation : la personne se reconnecte avec son mot de passe habituel', async () => {
    const e = await equipe();
    const gest = await membre(e.entrepriseId, 'GESTIONNAIRE');
    await e.admin.post(`/users/${gest.id}/desactiver`);
    expect((await e.admin.post(`/users/${gest.id}/reactiver`)).status).toBe(200);
    const connexion = await http().post('/auth/login').send({ email: gest.email, password: MOT_DE_PASSE_TEST });
    expect(connexion.status).toBe(200);
    expect((await avec(connexion.body.accessToken).get('/produits')).status).toBe(200);
    expect((await e.admin.post(`/users/${gest.id}/reactiver`)).status).toBe(409);
  });

  it('un administrateur rétrogradé perd ses droits immédiatement, malgré son token « ADMIN »', async () => {
    const e = await equipe();
    const second = await membre(e.entrepriseId, 'ADMIN');
    expect((await avec(second.token).get('/users')).status).toBe(200);
    expect((await e.admin.patch(`/users/${second.id}/role`, { role: 'GESTIONNAIRE' })).status).toBe(200);
    // Même token, émis quand il était ADMIN : la route réservée est refusée.
    expect((await avec(second.token).get('/users')).status).toBe(403);
    // Les routes ouvertes à tous restent accessibles.
    expect((await avec(second.token).get('/produits')).status).toBe(200);
  });

  it('garde-fous : ni soi-même, ni le dernier administrateur actif, ni un gestionnaire, ni une autre entreprise', async () => {
    const e = await equipe();
    expect((await e.admin.post(`/users/${e.adminId}/desactiver`)).status).toBe(409);

    const second = await membre(e.entrepriseId, 'ADMIN');
    expect((await e.admin.post(`/users/${second.id}/desactiver`)).status).toBe(200);
    // Le second administrateur étant désactivé, le premier est le dernier actif :
    // il ne peut pas être rétrogradé.
    expect((await e.admin.patch(`/users/${e.adminId}/role`, { role: 'GESTIONNAIRE' })).status).toBe(409);

    const gest = await membre(e.entrepriseId, 'GESTIONNAIRE');
    const autreGest = await membre(e.entrepriseId, 'GESTIONNAIRE');
    expect((await avec(gest.token).post(`/users/${autreGest.id}/desactiver`)).status).toBe(403);

    const autre = await equipe('Entreprise B');
    expect((await autre.admin.post(`/users/${gest.id}/desactiver`)).status).toBe(404);
    expect((await autre.admin.post(`/users/${gest.id}/reactiver`)).status).toBe(404);
    expect(await prisma.utilisateur.findUniqueOrThrow({ where: { id: gest.id } })).toMatchObject({ desactiveAt: null });
    expect((await e.admin.post('/users/pas-un-uuid/desactiver')).status).toBe(400);
  });

  it('token d’un utilisateur rattaché depuis à une autre entreprise : 401, jamais les données de l’une ou l’autre', async () => {
    const a = await equipe('Entreprise A');
    const b = await equipe('Entreprise B');
    const gest = await membre(a.entrepriseId, 'GESTIONNAIRE');
    await prisma.utilisateur.update({ where: { id: gest.id }, data: { entrepriseId: b.entrepriseId } });
    expect((await avec(gest.token).get('/produits')).status).toBe(401);
  });
});
