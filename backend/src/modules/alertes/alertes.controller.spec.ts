import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { DevEmailService } from '../../common/email/dev-email.service.js';

describe('Alertes (ALERT-003, ALERT-004) — intégration réelle, base PostgreSQL', () => {
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
      await prisma.alerte.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.mouvement.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.stock.deleteMany({ where: { produit: { entrepriseId: { in: entrepriseIds } } } });
      await prisma.refreshToken.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
      await prisma.utilisateur.deleteMany({ where: { email: { in: emailsCrees } } });
      await prisma.produit.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.emplacement.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
      await prisma.entreprise.deleteMany({ where: { id: { in: entrepriseIds } } });
      emailsCrees.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function creerContexte(seuilAlerte: number) {
    const email = `test-alerte-${Date.now()}-${Math.random().toString(36).slice(2)}@stockflow.dev`;
    emailsCrees.push(email);
    const registerResponse = await request(app.getHttpServer()).post('/auth/register').send({
      nomEntreprise: 'Entreprise Alertes',
      nomAdmin: 'Admin Alertes',
      email,
      password: 'motdepasse-solide-123',
    });
    const accessToken = registerResponse.body.accessToken as string;

    const produit = await request(app.getHttpServer())
      .post('/produits')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Vis inox 4mm', seuilAlerte });
    const emplacement = await request(app.getHttpServer())
      .post('/emplacements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nom: 'Entrepôt Alertes' });

    return {
      accessToken,
      email,
      produitId: produit.body.id as string,
      emplacementId: emplacement.body.id as string,
    };
  }

  it("liste les alertes actives par défaut, avec le produit concerné", async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte(5);
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 });
    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 8 });

    const response = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].type).toBe('STOCK_FAIBLE');
    expect(response.body[0].produit.nom).toBe('Vis inox 4mm');
  });

  it("les alertes résolues n'apparaissent plus dans la liste par défaut, mais restent consultables", async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte(5);
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 });
    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 8 });
    // Réapprovisionnement : l'alerte doit se résoudre automatiquement.
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 20 });

    const actives = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(actives.body).toHaveLength(0);

    const resolues = await request(app.getHttpServer())
      .get('/alertes?statut=RESOLUE')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(resolues.body).toHaveLength(1);
  });

  it('rejette avec 400 un statut invalide', async () => {
    const { accessToken } = await creerContexte(5);

    const response = await request(app.getHttpServer())
      .get('/alertes?statut=NIMPORTEQUOI')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(400);
  });

  it("une entreprise ne voit jamais les alertes d'une autre (isolation multi-tenant)", async () => {
    const contexteA = await creerContexte(5);
    const contexteB = await creerContexte(5);
    // Déclenche une alerte uniquement chez B.
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${contexteB.accessToken}`)
      .send({ produitId: contexteB.produitId, emplacementId: contexteB.emplacementId, quantite: 10 });
    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${contexteB.accessToken}`)
      .send({ produitId: contexteB.produitId, emplacementId: contexteB.emplacementId, quantite: 8 });

    const alertesDeA = await request(app.getHttpServer())
      .get('/alertes')
      .set('Authorization', `Bearer ${contexteA.accessToken}`);

    expect(alertesDeA.body).toHaveLength(0);
  });

  // ALERT-004 — Notification par email

  it('envoie un email aux utilisateurs de l’entreprise quand une alerte est déclenchée', async () => {
    const { accessToken, email, produitId, emplacementId } = await creerContexte(5);
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 });
    devEmail.clear(); // ignore les emails éventuels antérieurs

    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 8 });

    const emailsEnvoyes = devEmail.getSentEmails();
    expect(emailsEnvoyes).toHaveLength(1);
    expect(emailsEnvoyes[0].to).toBe(email);
    expect(emailsEnvoyes[0].subject).toContain('Stock faible');
    expect(emailsEnvoyes[0].body).toContain('Vis inox 4mm');
  });

  it('envoie un email spécifique en cas de rupture (stock à zéro)', async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte(5);
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 });
    devEmail.clear();

    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 10 });

    const emailsEnvoyes = devEmail.getSentEmails();
    expect(emailsEnvoyes).toHaveLength(1);
    expect(emailsEnvoyes[0].subject).toContain('Rupture');
  });

  it("ne renvoie pas d'email à chaque sortie tant que l'alerte reste de même gravité (pas de spam)", async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte(10);
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 20 });
    devEmail.clear();

    // Première sortie : stock = 8, sous le seuil de 10 → alerte + email.
    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 12 });
    // Seconde sortie : stock = 6, toujours STOCK_FAIBLE → pas de nouvel email.
    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 2 });

    expect(devEmail.getSentEmails()).toHaveLength(1);
  });

  it("envoie un nouvel email quand l'alerte passe de STOCK_FAIBLE à RUPTURE", async () => {
    const { accessToken, produitId, emplacementId } = await creerContexte(10);
    await request(app.getHttpServer())
      .post('/mouvements/entree')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 20 });
    devEmail.clear();

    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 12 }); // stock = 8 → STOCK_FAIBLE
    await request(app.getHttpServer())
      .post('/mouvements/sortie')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ produitId, emplacementId, quantite: 8 }); // stock = 0 → RUPTURE

    const emailsEnvoyes = devEmail.getSentEmails();
    expect(emailsEnvoyes).toHaveLength(2);
    expect(emailsEnvoyes[1].subject).toContain('Rupture');
  });
});
