import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { DevEmailService } from '../../common/email/dev-email.service.js';

describe('GET/PATCH /entreprise (intégration réelle, base PostgreSQL)', () => {
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
    const emailAdmin = `test-ent-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(emailAdmin);
    const registerResponse = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Config',
      nomAdmin: 'Admin Config',
      email: emailAdmin,
      password: 'motdepasse-solide-123',
    });
    const accessTokenAdmin = registerResponse.body.accessToken as string;

    const emailGestionnaire = `test-ent-gest-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(emailGestionnaire);
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${accessTokenAdmin}`)
      .send({ email: emailGestionnaire, role: 'GESTIONNAIRE' });
    const [emailEnvoye] = devEmail.getSentEmails();
    const token = emailEnvoye.body.match(/Jeton d'invitation : ([a-f0-9]+)/)?.[1];
    const acceptResponse = await request(app.getHttpServer())
      .post('/auth/accept-invite')
      .send({ token, nom: 'Gestionnaire Config', password: 'motdepasse-solide-123' });

    return { accessTokenAdmin, accessTokenGestionnaire: acceptResponse.body.accessToken as string };
  }

  it("un Gestionnaire peut consulter les informations de l'entreprise (lecture non restreinte à l'Admin)", async () => {
    const { accessTokenGestionnaire } = await creerAdminEtGestionnaire();

    const response = await request(app.getHttpServer())
      .get('/entreprise')
      .set('Authorization', `Bearer ${accessTokenGestionnaire}`);

    expect(response.status).toBe(200);
    expect(response.body.nom).toBe('Entreprise Config');
  });

  it("l'Admin peut modifier le nom de l'entreprise", async () => {
    const { accessTokenAdmin } = await creerAdminEtGestionnaire();

    const response = await request(app.getHttpServer())
      .patch('/entreprise')
      .set('Authorization', `Bearer ${accessTokenAdmin}`)
      .send({ nom: 'Nouveau Nom Entreprise' });

    expect(response.status).toBe(200);
    expect(response.body.nom).toBe('Nouveau Nom Entreprise');
  });

  it('rejette avec 403 une modification tentée par un Gestionnaire', async () => {
    const { accessTokenGestionnaire } = await creerAdminEtGestionnaire();

    const response = await request(app.getHttpServer())
      .patch('/entreprise')
      .set('Authorization', `Bearer ${accessTokenGestionnaire}`)
      .send({ nom: 'Tentative Non Autorisée' });

    expect(response.status).toBe(403);
  });

  it('une entreprise ne voit jamais les données d’une autre (isolation multi-tenant)', async () => {
    const { accessTokenAdmin: tokenEntrepriseA } = await creerAdminEtGestionnaire();
    const { accessTokenAdmin: tokenEntrepriseB } = await creerAdminEtGestionnaire();

    const reponseA = await request(app.getHttpServer())
      .get('/entreprise')
      .set('Authorization', `Bearer ${tokenEntrepriseA}`);
    const reponseB = await request(app.getHttpServer())
      .get('/entreprise')
      .set('Authorization', `Bearer ${tokenEntrepriseB}`);

    expect(reponseA.body.id).not.toBe(reponseB.body.id);
  });
});
