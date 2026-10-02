import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterClient, connecterOperateur, creerEntrepriseAvecAdmin, creerOperateur, nettoyer } from './console-test.utils.js';

describe('Console phase 2 — limites et modules par entreprise (intégration réelle)', () => {
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
    await prisma.invitation.deleteMany({ where: { entrepriseId: { in: entrepriseIds } } });
    await nettoyer(prisma, entrepriseIds.splice(0), operateurIds.splice(0));
  });

  afterAll(async () => {
    await app.close();
  });

  async function preparer() {
    const operateur = await creerOperateur(prisma);
    operateurIds.push(operateur.id);
    const tokenOperateur = await connecterOperateur(app, operateur.email);
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma);
    entrepriseIds.push(entreprise.id);
    const tokenClient = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    return { operateur, tokenOperateur, entreprise, tokenClient };
  }

  const regler = (token: string, id: string, corps: object) =>
    request(app.getHttpServer()).patch(`/console/entreprises/${id}/reglages`).set('Authorization', `Bearer ${token}`).send(corps);
  const client = (token: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, corps: object) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(corps),
  });

  it('part d’une entreprise sans limite et avec tous les modules, réglages visibles dans la fiche', async () => {
    const { tokenOperateur, entreprise } = await preparer();

    const fiche = await request(app.getHttpServer())
      .get(`/console/entreprises/${entreprise.id}`)
      .set('Authorization', `Bearer ${tokenOperateur}`);

    expect(fiche.body.reglages).toEqual({
      limites: { emplacements: null, utilisateurs: null, references: null },
      modules: { inventaires: true, transferts: true },
      usage: { emplacements: 0, utilisateurs: 1, references: 0 },
    });
  });

  it('bloque la création d’un emplacement au-delà de la limite, et libère une place à l’archivage', async () => {
    const { tokenOperateur, entreprise, tokenClient } = await preparer();
    const premier = await client(tokenClient).post('/emplacements', { nom: 'Madina' });
    expect(premier.status).toBe(201);
    expect((await regler(tokenOperateur, entreprise.id, { limiteEmplacements: 1 })).status).toBe(200);

    const refuse = await client(tokenClient).post('/emplacements', { nom: 'Kaloum' });
    expect(refuse.status).toBe(403);
    expect(refuse.body.code).toBe('LIMITE_ATTEINTE');
    expect(refuse.body.message).toContain('1 emplacement');

    await request(app.getHttpServer())
      .patch(`/emplacements/${premier.body.id}/archive`)
      .set('Authorization', `Bearer ${tokenClient}`);
    expect((await client(tokenClient).post('/emplacements', { nom: 'Kaloum' })).status).toBe(201);
  });

  it('bloque la création d’une référence au-delà de la limite', async () => {
    const { tokenOperateur, entreprise, tokenClient } = await preparer();
    await regler(tokenOperateur, entreprise.id, { limiteReferences: 1 });

    expect((await client(tokenClient).post('/produits', { nom: 'Ciment' })).status).toBe(201);
    const refuse = await client(tokenClient).post('/produits', { nom: 'Fer' });
    expect(refuse.status).toBe(403);
    expect(refuse.body.code).toBe('LIMITE_ATTEINTE');
  });

  it('compte les invitations en attente dans la limite d’utilisateurs', async () => {
    const { tokenOperateur, entreprise, tokenClient } = await preparer();
    await regler(tokenOperateur, entreprise.id, { limiteUtilisateurs: 2 });

    const premiere = await client(tokenClient).post('/users', { email: `invite-a-${Date.now()}@stockflow.dev`, role: 'GESTIONNAIRE' });
    expect(premiere.status).toBe(201);
    const refusee = await client(tokenClient).post('/users', { email: `invite-b-${Date.now()}@stockflow.dev`, role: 'GESTIONNAIRE' });
    expect(refusee.status).toBe(403);
    expect(refusee.body.code).toBe('LIMITE_ATTEINTE');
  });

  it('refuse une limite inférieure à l’usage actuel, sans rien modifier ni journaliser', async () => {
    const { tokenOperateur, entreprise, tokenClient } = await preparer();
    expect((await client(tokenClient).post('/emplacements', { nom: 'Madina' })).status).toBe(201);
    expect((await client(tokenClient).post('/emplacements', { nom: 'Kaloum' })).status).toBe(201);

    const reponse = await regler(tokenOperateur, entreprise.id, { limiteEmplacements: 1 });

    expect(reponse.status).toBe(400);
    expect(reponse.body.message).toContain('en utilise déjà 2');
    const enBase = await prisma.entreprise.findUniqueOrThrow({ where: { id: entreprise.id } });
    expect(enBase.limiteEmplacements).toBeNull();
    expect(await prisma.journalAudit.count({ where: { entrepriseId: entreprise.id, action: 'MODIFICATION_REGLAGES' } })).toBe(0);
  });

  it('journalise chaque modification avec le détail avant → après et le motif, et ignore une modification sans effet', async () => {
    const { operateur, tokenOperateur, entreprise } = await preparer();

    await regler(tokenOperateur, entreprise.id, { limiteReferences: 50, moduleTransferts: false, motif: 'Formule Essentiel' });
    await regler(tokenOperateur, entreprise.id, { limiteReferences: 50 });
    await regler(tokenOperateur, entreprise.id, { limiteReferences: null });

    const journal = await prisma.journalAudit.findMany({
      where: { entrepriseId: entreprise.id, action: 'MODIFICATION_REGLAGES' },
      orderBy: { createdAt: 'asc' },
    });
    expect(journal).toHaveLength(2);
    expect(journal[0]).toMatchObject({
      operateurId: operateur.id,
      motif: 'Formule Essentiel',
      detail: 'Références : illimité → 50 ; Transferts : activé → désactivé',
    });
    expect(journal[1].detail).toBe('Références : 50 → illimité');
  });

  it('refuse les routes d’un module désactivé (403) et les rouvre à la réactivation', async () => {
    const { tokenOperateur, entreprise, tokenClient } = await preparer();
    expect((await client(tokenClient).get('/inventaires')).status).toBe(200);

    await regler(tokenOperateur, entreprise.id, { moduleInventaires: false, moduleTransferts: false });

    const inventaires = await client(tokenClient).get('/inventaires');
    expect(inventaires.status).toBe(403);
    expect(inventaires.body.code).toBe('MODULE_DESACTIVE');
    const transfert = await client(tokenClient).post('/mouvements/transfert', {});
    expect(transfert.status).toBe(403);
    expect(transfert.body.code).toBe('MODULE_DESACTIVE');
    // Le reste de l'application n'est pas touché.
    expect((await client(tokenClient).get('/mouvements')).status).toBe(200);
    const entrepriseClient = await client(tokenClient).get('/entreprise');
    expect(entrepriseClient.body).toMatchObject({ moduleInventaires: false, moduleTransferts: false });

    await regler(tokenOperateur, entreprise.id, { moduleInventaires: true });
    expect((await client(tokenClient).get('/inventaires')).status).toBe(200);
  });

  it('valide les valeurs et refuse un token client (401)', async () => {
    const { tokenOperateur, entreprise, tokenClient } = await preparer();

    expect((await regler(tokenOperateur, entreprise.id, { limiteEmplacements: 0 })).status).toBe(400);
    expect((await regler(tokenOperateur, entreprise.id, { limiteEmplacements: 'trois' })).status).toBe(400);
    expect((await regler(tokenOperateur, entreprise.id, { moduleInventaires: 'non' })).status).toBe(400);
    expect((await regler(tokenClient, entreprise.id, { limiteEmplacements: 5 })).status).toBe(401);
    const enBase = await prisma.entreprise.findUniqueOrThrow({ where: { id: entreprise.id } });
    expect(enBase.limiteEmplacements).toBeNull();
  });
});
