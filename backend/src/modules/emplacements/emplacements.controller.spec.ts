import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { DevEmailService } from '../../common/email/dev-email.service.js';

describe('Emplacements (ENT-002, ENT-003) — intégration réelle, base PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let devEmail: DevEmailService;
  const emailsCrees: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    devEmail = moduleRef.get(DevEmailService);
  });

  afterEach(async () => {
    devEmail.clear();
    if (emailsCrees.length > 0) {
      const utilisateurs = await prisma.utilisateur.findMany({ where: { email: { in: emailsCrees } } });
      const utilisateurIds = utilisateurs.map((u) => u.id);
      const entrepriseIds = utilisateurs.map((u) => u.entrepriseId);
      await prisma.invitation.deleteMany({ where: { email: { in: emailsCrees } } });
      await prisma.refreshToken.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
      await prisma.utilisateur.deleteMany({ where: { email: { in: emailsCrees } } });
      await prisma.emplacement.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.entreprise.deleteMany({ where: { id: { in: entrepriseIds } } });
      emailsCrees.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function creerAdminEtGestionnaire() {
    const emailAdmin = `test-empl-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(emailAdmin);
    const registerResponse = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Emplacements',
      nomAdmin: 'Admin Emplacements',
      email: emailAdmin,
      password: 'motdepasse-solide-123',
    });
    const accessTokenAdmin = registerResponse.body.accessToken as string;

    const emailGestionnaire = `test-empl-gest-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(emailGestionnaire);
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${accessTokenAdmin}`)
      .send({ email: emailGestionnaire, role: 'GESTIONNAIRE' });
    const [emailEnvoye] = devEmail.getSentEmails();
    const token = emailEnvoye.body.match(/Jeton d'invitation : ([a-f0-9]+)/)?.[1];
    const acceptResponse = await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token, nom: 'Gestionnaire Emplacements', password: 'motdepasse-solide-123' });

    return { accessTokenAdmin, accessTokenGestionnaire: acceptResponse.body.accessToken as string };
  }

  it("l'Admin peut créer un emplacement", async () => {
    const { accessTokenAdmin } = await creerAdminEtGestionnaire();

    const response = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessTokenAdmin}`)
      .send({ nom: 'Entrepôt principal', adresse: '1 rue du Stock' });

    expect(response.status).toBe(201);
    expect(response.body.nom).toBe('Entrepôt principal');
    expect(response.body.archive).toBe(false);
  });

  it('rejette avec 403 une création tentée par un Gestionnaire', async () => {
    const { accessTokenGestionnaire } = await creerAdminEtGestionnaire();

    const response = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessTokenGestionnaire}`)
      .send({ nom: 'Entrepôt Non Autorisé' });

    expect(response.status).toBe(403);
  });

  it('un Gestionnaire peut lister les emplacements (lecture non restreinte)', async () => {
    const { accessTokenAdmin, accessTokenGestionnaire } = await creerAdminEtGestionnaire();
    await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessTokenAdmin}`)
      .send({ nom: 'Entrepôt Nord' });

    const response = await request(app.getHttpServer())
      .get('/emplacements')
      .set('Authorization', `Bearer ${accessTokenGestionnaire}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].nom).toBe('Entrepôt Nord');
  });

  it("l'Admin peut modifier un emplacement", async () => {
    const { accessTokenAdmin } = await creerAdminEtGestionnaire();
    const creation = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessTokenAdmin}`)
      .send({ nom: 'Ancien Nom' });

    const response = await request(app.getHttpServer())
      .patch(`/emplacements/${creation.body.id}`)
      .set('Authorization', `Bearer ${accessTokenAdmin}`)
      .send({ nom: 'Nouveau Nom' });

    expect(response.status).toBe(200);
    expect(response.body.nom).toBe('Nouveau Nom');
  });

  it("l'archivage masque l'emplacement de la liste par défaut, mais le conserve accessible via ?archive=true", async () => {
    const { accessTokenAdmin } = await creerAdminEtGestionnaire();
    const creation = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessTokenAdmin}`)
      .send({ nom: 'À archiver' });

    const archivage = await request(app.getHttpServer())
      .patch(`/emplacements/${creation.body.id}/archive`)
      .set('Authorization', `Bearer ${accessTokenAdmin}`);
    expect(archivage.status).toBe(200);
    expect(archivage.body.archive).toBe(true);

    const listeParDefaut = await request(app.getHttpServer())
      .get('/emplacements')
      .set('Authorization', `Bearer ${accessTokenAdmin}`);
    expect(listeParDefaut.body).toHaveLength(0);

    const listeAvecArchives = await request(app.getHttpServer())
      .get('/emplacements?archive=true')
      .set('Authorization', `Bearer ${accessTokenAdmin}`);
    expect(listeAvecArchives.body).toHaveLength(1);
    expect(listeAvecArchives.body[0].archive).toBe(true);
  });

  it("rejette avec 404 la modification d'un emplacement appartenant à une autre entreprise (isolation multi-tenant)", async () => {
    const { accessTokenAdmin: tokenEntrepriseA } = await creerAdminEtGestionnaire();
    const { accessTokenAdmin: tokenEntrepriseB } = await creerAdminEtGestionnaire();

    const emplacementDeB = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${tokenEntrepriseB}`)
      .send({ nom: 'Emplacement de B' });

    const tentativeDepuisA = await request(app.getHttpServer())
      .patch(`/emplacements/${emplacementDeB.body.id}`)
      .set('Authorization', `Bearer ${tokenEntrepriseA}`)
      .send({ nom: 'Tentative de modification illégitime' });

    expect(tentativeDepuisA.status).toBe(404);

    // Vérifie que la donnée n'a pas été modifiée malgré la tentative.
    const emplacementInchange = await prisma.emplacement.findUnique({ where: { id: emplacementDeB.body.id } });
    expect(emplacementInchange?.nom).toBe('Emplacement de B');
  });

  it('rejette avec 400 la création avec un nom manquant', async () => {
    const { accessTokenAdmin } = await creerAdminEtGestionnaire();

    const response = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessTokenAdmin}`)
      .send({ adresse: 'Sans nom' });

    expect(response.status).toBe(400);
  });
});
