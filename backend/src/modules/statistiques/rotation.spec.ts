import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';
import { indicateursRotation } from './rotation.js';

describe('Rotation — indicateurs purs', () => {
  it('rotation, couverture et dormance', () => {
    expect(indicateursRotation({ stock: 50, sorties: 100, jours: 90 })).toEqual({ rotation: 2, couvertureJours: 45, dormant: false });
    expect(indicateursRotation({ stock: 20, sorties: 0, jours: 90 })).toEqual({ rotation: 0, couvertureJours: null, dormant: true });
    expect(indicateursRotation({ stock: 0, sorties: 10, jours: 90 })).toEqual({ rotation: null, couvertureJours: null, dormant: false });
  });
});

describe('Rotation et stock dormant — intégration réelle, base PostgreSQL', () => {
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

  it('sorties nettes vers les clients, stock dormant valorisé, agrégats par catégorie', async () => {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, 'Entreprise Rotation');
    entrepriseIds.push(entreprise.id);
    const jeton = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    const avec = (r: request.Test) => r.set('Authorization', `Bearer ${jeton}`);
    const post = (url: string, corps: object = {}) => avec(request(app.getHttpServer()).post(url)).send(corps);
    const get = (url: string) => avec(request(app.getHttpServer()).get(url));

    expect((await get('/statistiques/rotation')).status).toBe(403);
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { moduleRotation: true } });

    const madina = (await post('/emplacements', { nom: 'Madina' })).body.id as string;
    const boissons = (await post('/categories', { nom: 'Boissons' })).body.id as string;
    const soda = (await post('/produits', { nom: 'Soda', prixAchat: 100, prixVente: 150, categorieId: boissons })).body.id as string;
    const tapis = (await post('/produits', { nom: 'Tapis', prixAchat: 5000 })).body.id as string;
    await post('/mouvements/entree', { produitId: soda, emplacementId: madina, quantite: 100 });
    await post('/mouvements/entree', { produitId: tapis, emplacementId: madina, quantite: 4 });
    const vente = (await post('/ventes', { emplacementId: madina, modePaiement: 'ESPECES', lignes: [{ produitId: soda, quantite: 60 }] })).body;
    await post('/ventes', { emplacementId: madina, modePaiement: 'ESPECES', lignes: [{ produitId: soda, quantite: 10 }] });
    await post(`/ventes/${vente.id}/annuler`, { motif: 'Erreur de caisse' });

    const rapport = await get('/statistiques/rotation?jours=30');
    expect(rapport.status).toBe(200);
    const parNom = Object.fromEntries(rapport.body.produits.map((p: { produit: { nom: string } }) => [p.produit.nom, p]));
    // 60 + 10 vendus, 60 restitués par l'annulation : 10 nets ; stock 90.
    expect(parNom.Soda).toMatchObject({ stock: 90, sorties: 10, valeur: 9000, dormant: false, rotation: 0.11 });
    expect(parNom.Tapis).toMatchObject({ stock: 4, sorties: 0, valeur: 20000, dormant: true });
    expect(rapport.body.produits[0].produit.nom).toBe('Tapis');
    expect(rapport.body.totaux).toEqual({ valeurStock: 29000, valeurDormante: 20000, produitsDormants: 1 });
    expect(rapport.body.categories.map((c: { categorie: string }) => c.categorie)).toEqual(['Sans catégorie', 'Boissons']);
    expect((await get('/statistiques/rotation?jours=3')).status).toBe(400);
  });
});
