import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';

// PNG 1x1 minimal, valide, encodé en base64 — évite de dépendre d'un
// fichier externe pour ce test.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('Uploads — intégration réelle avec Cloudinary', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emailsCrees: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterEach(async () => {
    if (emailsCrees.length > 0) {
      const utilisateurs = await prisma.utilisateur.findMany({ where: { email: { in: emailsCrees } } });
      const utilisateurIds = utilisateurs.map((u) => u.id);
      const entrepriseIds = utilisateurs.map((u) => u.entrepriseId);
      await prisma.refreshToken.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
      await prisma.verificationEmail.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
      await prisma.utilisateur.deleteMany({ where: { email: { in: emailsCrees } } });
      await prisma.entreprise.deleteMany({ where: { id: { in: entrepriseIds } } });
      emailsCrees.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function creerAdmin() {
    const email = `test-upload-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Upload',
      nomAdmin: 'Admin Upload',
      email,
      password: 'motdepasse-solide-123',
    });
    // Compte vérifié directement en base plutôt que de passer par le
    // vrai lien de confirmation : ce test porte sur autre chose que le
    // parcours de vérification d'email, qui a ses propres tests dédiés.
    await prisma.utilisateur.update({ where: { email }, data: { emailVerifieAt: new Date() } });
    const connexion = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'motdepasse-solide-123' });
    return connexion.body.accessToken as string;
  }

  it(
    'téléverse réellement une image vers Cloudinary et retourne une URL accessible',
    async () => {
      const accessToken = await creerAdmin();

      const response = await request(app.getHttpServer())
        .post('/uploads/image?type=produits')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('fichier', PNG_1X1, { filename: 'test.png', contentType: 'image/png' });

      expect(response.status).toBe(201);
      expect(response.body.url).toMatch(/^https:\/\/res\.cloudinary\.com\//);

      // Vérifie que l'URL renvoyée est réellement accessible, pas
      // seulement bien formée.
      const imageReponse = await fetch(response.body.url);
      expect(imageReponse.status).toBe(200);
    },
    15000, // Appel réseau réel vers Cloudinary : délai étendu.
  );

  it('rejette avec 401 un envoi sans authentification', async () => {
    const response = await request(app.getHttpServer())
      .post('/uploads/image?type=produits')
      .attach('fichier', PNG_1X1, { filename: 'test.png', contentType: 'image/png' });

    expect(response.status).toBe(401);
  });

  it('rejette avec 400 un type de dossier invalide', async () => {
    const accessToken = await creerAdmin();

    const response = await request(app.getHttpServer())
      .post('/uploads/image?type=nimportequoi')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('fichier', PNG_1X1, { filename: 'test.png', contentType: 'image/png' });

    expect(response.status).toBe(400);
  });

  it('rejette avec 400 un fichier qui n’est pas une image', async () => {
    const accessToken = await creerAdmin();

    const response = await request(app.getHttpServer())
      .post('/uploads/image?type=produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('fichier', Buffer.from('{"pas":"une image"}'), {
        filename: 'test.json',
        contentType: 'application/json',
      });

    expect(response.status).toBe(400);
  });
});
