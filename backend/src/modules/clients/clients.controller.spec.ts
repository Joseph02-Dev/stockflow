import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';

describe('Clients', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const entrepriseIds: string[] = [];
  let jetonA: string;
  let jetonB: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const a = await creerEntrepriseAvecAdmin(prisma, 'Entreprise Clients A');
    const b = await creerEntrepriseAvecAdmin(prisma, 'Entreprise Clients B');
    entrepriseIds.push(a.entreprise.id, b.entreprise.id);
    jetonA = (await connecterClient(app, a.utilisateur.email)).body.accessToken;
    jetonB = (await connecterClient(app, b.utilisateur.email)).body.accessToken;
  });

  afterAll(async () => {
    await nettoyer(prisma, entrepriseIds, []);
    await app.close();
  });

  const http = (jeton: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${jeton}`),
    post: (url: string, corps: object) =>
      request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${jeton}`).send(corps),
    patch: (url: string, corps: object = {}) =>
      request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${jeton}`).send(corps),
  });

  it('crée un client avec la catégorie DETAIL par défaut', async () => {
    const reponse = await http(jetonA).post('/clients', { nom: 'Mamadou Diallo', telephone: '+224 622 45 18 03' });

    expect(reponse.status).toBe(201);
    expect(reponse.body).toMatchObject({ nom: 'Mamadou Diallo', categorie: 'DETAIL', archive: false, plafondCredit: null });
  });

  it('refuse un téléphone qui n’est pas au format international', async () => {
    const reponse = await http(jetonA).post('/clients', { nom: 'Sans indicatif', telephone: '622451803' });

    expect(reponse.status).toBe(400);
  });

  it('refuse un plafond de crédit non entier', async () => {
    const reponse = await http(jetonA).post('/clients', { nom: 'Plafond flottant', plafondCredit: 1500.5 });

    expect(reponse.status).toBe(400);
  });

  it('modifie la catégorie et le plafond, et efface le téléphone avec null', async () => {
    const cree = await http(jetonA).post('/clients', {
      nom: 'Ets Camara & Frères',
      telephone: '+224 664 00 11 22',
      categorie: 'GROS',
    });

    const reponse = await http(jetonA).patch(`/clients/${cree.body.id}`, {
      categorie: 'DEMI_GROS',
      plafondCredit: 5_000_000,
      telephone: null,
    });

    expect(reponse.status).toBe(200);
    expect(reponse.body).toMatchObject({ categorie: 'DEMI_GROS', plafondCredit: 5_000_000, telephone: null });
  });

  it('archive sans supprimer : le client sort de la liste mais reste consultable', async () => {
    const cree = await http(jetonA).post('/clients', { nom: 'Client à archiver' });

    const archive = await http(jetonA).patch(`/clients/${cree.body.id}/archive`);
    expect(archive.status).toBe(200);
    expect(archive.body.archive).toBe(true);

    const actifs = await http(jetonA).get('/clients');
    expect(actifs.body.map((c: { id: string }) => c.id)).not.toContain(cree.body.id);
    const tous = await http(jetonA).get('/clients?archive=true');
    expect(tous.body.map((c: { id: string }) => c.id)).toContain(cree.body.id);
    expect(await prisma.client.count({ where: { id: cree.body.id } })).toBe(1);
  });

  it('recherche par nom, commerce ou téléphone', async () => {
    await http(jetonA).post('/clients', { nom: 'Fatoumata Bah', nomCommerce: 'Boutique Madina', telephone: '+224 655 12 34 56' });

    for (const terme of ['fatou', 'madina', '655 12']) {
      const reponse = await http(jetonA).get(`/clients?search=${encodeURIComponent(terme)}`);
      expect(reponse.body.map((c: { nom: string }) => c.nom)).toContain('Fatoumata Bah');
    }
  });

  it('isolation multi-tenant : une entreprise ne voit ni ne modifie les clients d’une autre', async () => {
    const cree = await http(jetonA).post('/clients', { nom: 'Client secret de A' });

    const liste = await http(jetonB).get('/clients?archive=true');
    expect(liste.body.map((c: { id: string }) => c.id)).not.toContain(cree.body.id);
    expect((await http(jetonB).get(`/clients/${cree.body.id}`)).status).toBe(404);
    expect((await http(jetonB).patch(`/clients/${cree.body.id}`, { nom: 'Piraté' })).status).toBe(404);
    expect((await http(jetonB).patch(`/clients/${cree.body.id}/archive`)).status).toBe(404);
  });
});
