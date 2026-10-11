import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';

describe('Valorisation du stock (FIFO, PMP) — intégration réelle, base PostgreSQL', () => {
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

  afterEach(async () => {
    await nettoyer(prisma, entrepriseIds.splice(0), []);
  });

  afterAll(async () => {
    await app.close();
  });

  async function contexte() {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, 'Entreprise Valorisation');
    entrepriseIds.push(entreprise.id);
    const jeton = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    const avec = (r: request.Test) => r.set('Authorization', `Bearer ${jeton}`);
    const http = {
      get: (url: string) => avec(request(app.getHttpServer()).get(url)),
      post: (url: string, corps: object = {}) => avec(request(app.getHttpServer()).post(url)).send(corps),
      patch: (url: string, corps: object = {}) => avec(request(app.getHttpServer()).patch(url)).send(corps),
    };
    const madina = (await http.post('/emplacements', { nom: 'Madina' })).body.id as string;
    const coyah = (await http.post('/emplacements', { nom: 'Coyah' })).body.id as string;
    return { http, madina, coyah };
  }

  const valeurDe = async (http: Awaited<ReturnType<typeof contexte>>['http'], produitId: string) => {
    const resume = await http.get('/valorisation');
    expect(resume.status).toBe(200);
    return resume.body.produits.find((p: { produit: { id: string } }) => p.produit.id === produitId) as
      | { quantite: number; valeur: number; coutMoyen: number }
      | undefined;
  };

  it('activation : le stock présent est ouvert au prix d’achat actuel', async () => {
    const { http, madina } = await contexte();
    const produitId = (await http.post('/produits', { nom: 'Ciment', prixAchat: 75000 })).body.id as string;
    await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 10 });
    expect((await http.get('/valorisation')).status).toBe(403);

    expect((await http.patch('/entreprise', { moduleValorisation: true, methodeValorisation: 'FIFO' })).status).toBe(200);
    expect(await valeurDe(http, produitId)).toMatchObject({ quantite: 10, valeur: 750000, coutMoyen: 75000 });
    const couches = await http.get(`/valorisation/produits/${produitId}/couches`);
    expect(couches.body[0]).toMatchObject({ libelle: 'Ouverture', quantite: 10, quantiteRestante: 10 });
  });

  it('FIFO : la sortie prend le coût des entrées les plus anciennes ; un transfert ne change pas la valeur', async () => {
    const { http, madina, coyah } = await contexte();
    await http.patch('/entreprise', { moduleValorisation: true, methodeValorisation: 'FIFO' });
    const produitId = (await http.post('/produits', { nom: 'Huile', prixAchat: 999 })).body.id as string;
    await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 10, coutUnitaire: 100 });
    await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 10, coutUnitaire: 130 });
    await http.post('/mouvements/transfert', { produitId, emplacementSourceId: madina, emplacementDestinationId: coyah, quantite: 5 });
    await http.post('/mouvements/sortie', { produitId, emplacementId: madina, quantite: 12 });

    // Sortie de 12 : 10 × 100 + 2 × 130 = 1 260 ; reste 8 × 130 = 1 040.
    const sortie = await prisma.coucheValorisation.findFirstOrThrow({ where: { produitId, quantite: { lt: 0 } } });
    expect(Number(sortie.valeur)).toBe(-1260);
    expect(await valeurDe(http, produitId)).toMatchObject({ quantite: 8, valeur: 1040, coutMoyen: 130 });
    expect(await prisma.coucheValorisation.count({ where: { produitId } })).toBe(3);
  });

  it('PMP : la sortie prend le coût moyen ; coût saisi par carton ramené à l’unité ; casse valorisée', async () => {
    const { http, madina } = await contexte();
    await http.patch('/entreprise', { moduleValorisation: true, moduleConditionnements: true, methodeValorisation: 'PMP' });
    const produitId = (await http.post('/produits', { nom: 'Eau', prixAchat: 900 })).body.id as string;
    const carton = (await http.post(`/produits/${produitId}/conditionnements`, { nom: 'Carton', facteur: 12 })).body.id as string;
    await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 1, conditionnementId: carton, coutUnitaire: 12000 });
    await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 12, coutUnitaire: 1500 });
    // 12 × 1 000 + 12 × 1 500 = 30 000 pour 24 : coût moyen 1 250.
    expect(await valeurDe(http, produitId)).toMatchObject({ quantite: 24, valeur: 30000, coutMoyen: 1250 });

    await http.post('/mouvements/sortie', { produitId, emplacementId: madina, quantite: 4 });
    await http.post('/pertes', { produitId, emplacementId: madina, quantite: 2, motif: 'CASSE_MANUTENTION' });
    expect(await valeurDe(http, produitId)).toMatchObject({ quantite: 18, valeur: 22500, coutMoyen: 1250 });
  });

  it('réactivation : les mouvements passés sans valorisation sont resynchronisés', async () => {
    const { http, madina } = await contexte();
    await http.patch('/entreprise', { moduleValorisation: true });
    const produitId = (await http.post('/produits', { nom: 'Riz', prixAchat: 200 })).body.id as string;
    await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 10, coutUnitaire: 180 });
    await http.patch('/entreprise', { moduleValorisation: false });
    await http.post('/mouvements/sortie', { produitId, emplacementId: madina, quantite: 4 });
    await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 1 });
    await http.patch('/entreprise', { moduleValorisation: true });
    expect(await valeurDe(http, produitId)).toMatchObject({ quantite: 7 });
    const resync = await prisma.coucheValorisation.findMany({ where: { produitId, libelle: 'Resynchronisation' } });
    expect(resync.map((c) => c.quantite)).toEqual([-3]);
  });
});
