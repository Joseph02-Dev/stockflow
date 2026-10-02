import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { MESSAGE_ENTREPRISE_SUSPENDUE } from '../../common/entreprise-suspendue.js';
import {
  connecterClient,
  connecterOperateur,
  creerEntrepriseAvecAdmin,
  creerOperateur,
  nettoyer,
} from './console-test.utils.js';

describe('Console — suspension et rétablissement (intégration réelle)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const entrepriseIds: string[] = [];
  const operateurIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterEach(async () => {
    await nettoyer(prisma, entrepriseIds.splice(0), operateurIds.splice(0));
  });

  afterAll(async () => {
    await app.close();
  });

  /** Une entreprise dont l'admin est connecté, et un opérateur connecté. */
  async function preparer() {
    const operateur = await creerOperateur(prisma);
    operateurIds.push(operateur.id);
    const tokenOperateur = await connecterOperateur(app, operateur.email);
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma);
    entrepriseIds.push(entreprise.id);
    const connexion = await connecterClient(app, utilisateur.email);
    expect(connexion.status).toBe(200);
    return { operateur, tokenOperateur, entreprise, utilisateur, accessToken: connexion.body.accessToken as string };
  }

  function suspendre(tokenOperateur: string, entrepriseId: string, corps: object = { motif: 'Impayé' }) {
    return request(app.getHttpServer())
      .post(`/console/entreprises/${entrepriseId}/suspendre`)
      .set('Authorization', `Bearer ${tokenOperateur}`)
      .send(corps);
  }

  function retablir(tokenOperateur: string, entrepriseId: string) {
    return request(app.getHttpServer())
      .post(`/console/entreprises/${entrepriseId}/retablir`)
      .set('Authorization', `Bearer ${tokenOperateur}`)
      .send({});
  }

  it('révoque tous les refresh tokens de l’entreprise (vérification en base)', async () => {
    const { tokenOperateur, entreprise, utilisateur } = await preparer();
    await connecterClient(app, utilisateur.email); // seconde session
    expect(await prisma.refreshToken.count({ where: { utilisateurId: utilisateur.id, revokedAt: null } })).toBe(2);

    const reponse = await suspendre(tokenOperateur, entreprise.id);

    expect(reponse.status).toBe(200);
    expect(reponse.body).toMatchObject({ statut: 'SUSPENDUE', motifSuspension: 'Impayé', sessionsRevoquees: 2 });
    expect(await prisma.refreshToken.count({ where: { utilisateurId: utilisateur.id, revokedAt: null } })).toBe(0);
    const enBase = await prisma.entreprise.findUniqueOrThrow({ where: { id: entreprise.id } });
    expect(enBase.statut).toBe('SUSPENDUE');
    expect(enBase.suspendueAt).not.toBeNull();
  });

  it('refuse la connexion d’un utilisateur d’une entreprise suspendue (403)', async () => {
    const { tokenOperateur, entreprise, utilisateur } = await preparer();
    await suspendre(tokenOperateur, entreprise.id);

    const reponse = await connecterClient(app, utilisateur.email);

    expect(reponse.status).toBe(403);
    expect(reponse.body.message).toBe(MESSAGE_ENTREPRISE_SUSPENDUE);
    expect(reponse.body.code).toBe('ENTREPRISE_SUSPENDUE');
  });

  it('ne révèle pas la suspension à qui n’a pas le bon mot de passe (401 générique)', async () => {
    const { tokenOperateur, entreprise, utilisateur } = await preparer();
    await suspendre(tokenOperateur, entreprise.id);

    const reponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: utilisateur.email, password: 'mauvais-mot-de-passe' });

    expect(reponse.status).toBe(401);
    expect(JSON.stringify(reponse.body)).not.toContain('suspendu');
  });

  it('refuse un access token encore valide dès la suspension (403 au garde)', async () => {
    const { tokenOperateur, entreprise, accessToken } = await preparer();
    const avant = await request(app.getHttpServer()).get('/produits').set('Authorization', `Bearer ${accessToken}`);
    expect(avant.status).toBe(200);

    await suspendre(tokenOperateur, entreprise.id);

    for (const route of ['/produits', '/dashboard/overview', '/stock']) {
      const reponse = await request(app.getHttpServer()).get(route).set('Authorization', `Bearer ${accessToken}`);
      expect(reponse.status, route).toBe(403);
      expect(reponse.body.message).toBe(MESSAGE_ENTREPRISE_SUSPENDUE);
    }
  });

  it('rétablit l’accès : la connexion fonctionne de nouveau', async () => {
    const { tokenOperateur, entreprise, utilisateur } = await preparer();
    await suspendre(tokenOperateur, entreprise.id);
    expect((await connecterClient(app, utilisateur.email)).status).toBe(403);

    const reponse = await retablir(tokenOperateur, entreprise.id);

    expect(reponse.status).toBe(200);
    expect(reponse.body).toMatchObject({ statut: 'ACTIVE', suspendueAt: null, motifSuspension: null });
    const connexion = await connecterClient(app, utilisateur.email);
    expect(connexion.status).toBe(200);
    const produits = await request(app.getHttpServer())
      .get('/produits')
      .set('Authorization', `Bearer ${connexion.body.accessToken}`);
    expect(produits.status).toBe(200);
  });

  it('refuse une suspension sans motif (400), y compris un motif vide', async () => {
    const { tokenOperateur, entreprise } = await preparer();

    expect((await suspendre(tokenOperateur, entreprise.id, {})).status).toBe(400);
    expect((await suspendre(tokenOperateur, entreprise.id, { motif: '   ' })).status).toBe(400);
    const enBase = await prisma.entreprise.findUniqueOrThrow({ where: { id: entreprise.id } });
    expect(enBase.statut).toBe('ACTIVE');
  });

  it('inscrit chaque suspension et chaque rétablissement au journal', async () => {
    const { operateur, tokenOperateur, entreprise } = await preparer();

    await suspendre(tokenOperateur, entreprise.id, { motif: 'Usage anormal détecté' });
    await retablir(tokenOperateur, entreprise.id);
    await suspendre(tokenOperateur, entreprise.id, { motif: 'Demande de l’entreprise' });

    const journal = await prisma.journalAudit.findMany({
      where: { entrepriseId: entreprise.id, action: { in: ['SUSPENSION', 'RETABLISSEMENT'] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(journal.map((e) => [e.action, e.motif])).toEqual([
      ['SUSPENSION', 'Usage anormal détecté'],
      ['RETABLISSEMENT', null],
      ['SUSPENSION', 'Demande de l’entreprise'],
    ]);
    expect(journal.every((e) => e.operateurId === operateur.id)).toBe(true);
  });

  it('refuse de suspendre deux fois ou de rétablir une entreprise active (409)', async () => {
    const { tokenOperateur, entreprise } = await preparer();

    expect((await retablir(tokenOperateur, entreprise.id)).status).toBe(409);
    expect((await suspendre(tokenOperateur, entreprise.id)).status).toBe(200);
    expect((await suspendre(tokenOperateur, entreprise.id)).status).toBe(409);
  });

  it('n’envoie plus de lien de réinitialisation à une entreprise suspendue, sans le révéler', async () => {
    const { tokenOperateur, entreprise, utilisateur } = await preparer();
    await suspendre(tokenOperateur, entreprise.id);

    const reponse = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: utilisateur.email });

    expect(reponse.status).toBe(200);
    expect(await prisma.reinitialisationMotDePasse.count({ where: { utilisateurId: utilisateur.id } })).toBe(0);
  });

  it('ne laisse aucun token client suspendre une entreprise (401)', async () => {
    const { entreprise, accessToken } = await preparer();

    const reponse = await suspendre(accessToken, entreprise.id);

    expect(reponse.status).toBe(401);
    const enBase = await prisma.entreprise.findUniqueOrThrow({ where: { id: entreprise.id } });
    expect(enBase.statut).toBe('ACTIVE');
  });
});
