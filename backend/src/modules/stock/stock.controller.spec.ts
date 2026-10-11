import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';

describe('Moteur de stock en double entrée, arborescence et modules — intégration réelle, base PostgreSQL', () => {
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
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, 'Entreprise Stock');
    entrepriseIds.push(entreprise.id);
    const jeton = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    const http = {
      get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${jeton}`),
      post: (url: string, corps: object) =>
        request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${jeton}`).send(corps),
      patch: (url: string, corps: object) =>
        request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${jeton}`).send(corps),
    };
    const produitId = (await http.post('/produits', { nom: 'Ciment', prixVente: 1000 })).body.id as string;
    const madina = (await http.post('/emplacements', { nom: 'Madina' })).body.id as string;
    const coyah = (await http.post('/emplacements', { nom: 'Coyah' })).body.id as string;
    return { entreprise, utilisateur, http, produitId, madina, coyah };
  }

  it('POST /stock/mouvements : réception, transfert et sortie en source → destination', async () => {
    const { http, produitId, madina, coyah } = await contexte();

    const reception = await http.post('/stock/mouvements', {
      produitId,
      source: { nature: 'FOURNISSEUR' },
      destination: { nature: 'INTERNE', emplacementId: madina },
      quantite: 40,
    });
    expect(reception.status).toBe(201);
    expect(reception.body).toMatchObject({ type: 'ENTREE', origine: 'FOURNISSEUR', destination: 'INTERNE' });

    const transfert = await http.post('/stock/mouvements', {
      produitId,
      source: { nature: 'INTERNE', emplacementId: madina },
      destination: { nature: 'INTERNE', emplacementId: coyah },
      quantite: 15,
    });
    expect(transfert.status).toBe(201);
    expect(transfert.body).toMatchObject({ type: 'TRANSFERT', origine: 'INTERNE', destination: 'INTERNE' });

    const sortie = await http.post('/stock/mouvements', {
      produitId,
      source: { nature: 'INTERNE', emplacementId: coyah },
      destination: { nature: 'CLIENT' },
      quantite: 5,
    });
    expect(sortie.status).toBe(201);
    expect(sortie.body).toMatchObject({ type: 'SORTIE', origine: 'INTERNE', destination: 'CLIENT' });

    const quantites = await http.get(`/stock/quantites?produit_id=${produitId}`);
    expect(quantites.status).toBe(200);
    const parEmplacement = Object.fromEntries(
      (quantites.body as { emplacement: { nom: string }; quantite: number }[]).map((q) => [q.emplacement.nom, q.quantite]),
    );
    expect(parEmplacement).toEqual({ Madina: 25, Coyah: 10 });

    const historique = await http.get(`/stock/mouvements?produit_id=${produitId}`);
    expect(
      (historique.body as { source: { libelle: string }; destination: { libelle: string } }[]).map(
        (m) => `${m.source.libelle} → ${m.destination.libelle}`,
      ),
    ).toEqual(['Coyah → Clients', 'Madina → Coyah', 'Fournisseurs → Madina']);
  });

  it('POST /stock/mouvements : stock insuffisant, sens non pris en charge, emplacement manquant', async () => {
    const { http, produitId, madina } = await contexte();

    const insuffisant = await http.post('/stock/mouvements', {
      produitId,
      source: { nature: 'INTERNE', emplacementId: madina },
      destination: { nature: 'CLIENT' },
      quantite: 1,
    });
    expect(insuffisant.status).toBe(409);

    const casse = await http.post('/stock/mouvements', {
      produitId,
      source: { nature: 'INTERNE', emplacementId: madina },
      destination: { nature: 'REBUT' },
      quantite: 1,
    });
    expect(casse.status).toBe(400);
    expect(casse.body.message).toMatch(/Pertes/);

    const sansEmplacement = await http.post('/stock/mouvements', {
      produitId,
      source: { nature: 'FOURNISSEUR' },
      destination: { nature: 'INTERNE' },
      quantite: 1,
    });
    expect(sansEmplacement.status).toBe(400);

    const natureInconnue = await http.post('/stock/mouvements', {
      produitId,
      source: { nature: 'ENTREPOT' },
      destination: { nature: 'INTERNE', emplacementId: madina },
      quantite: 1,
    });
    expect(natureInconnue.status).toBe(400);
  });

  it('chaque écriture passe par le moteur : origine précise pour une vente annulée et un inventaire', async () => {
    const { http, produitId, madina } = await contexte();
    await http.post('/mouvements/entree', { produitId, emplacementId: madina, quantite: 10 });
    const vente = await http.post('/ventes', {
      emplacementId: madina,
      modePaiement: 'ESPECES',
      lignes: [{ produitId, quantite: 3 }],
    });
    expect(vente.status).toBe(201);
    const annulation = await http.post(`/ventes/${vente.body.id}/annuler`, { motif: 'Erreur de saisie' });
    expect(annulation.status).toBeLessThan(300);

    const mouvements = await prisma.mouvement.findMany({
      where: { produitId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, origine: true, destination: true },
    });
    expect(mouvements).toEqual([
      { type: 'ENTREE', origine: 'FOURNISSEUR', destination: 'INTERNE' },
      { type: 'SORTIE', origine: 'INTERNE', destination: 'CLIENT' },
      { type: 'ENTREE', origine: 'CLIENT', destination: 'INTERNE' },
    ]);
  });

  it('une ancienne version de l’API (INSERT sans origine) reste valide grâce au déclencheur ; la base refuse un mouvement sans côté interne', async () => {
    const { entreprise, utilisateur, produitId, madina } = await contexte();
    const [insere] = await prisma.$queryRaw<{ origine: string; destination: string }[]>`
      INSERT INTO mouvement (id, entreprise_id, produit_id, emplacement_id, type, quantite, utilisateur_id)
      VALUES (gen_random_uuid(), ${entreprise.id}, ${produitId}, ${madina}, 'CASSE', 1, ${utilisateur.id})
      RETURNING origine::text, destination::text`;
    expect(insere).toEqual({ origine: 'INTERNE', destination: 'REBUT' });

    await expect(prisma.$executeRaw`
      INSERT INTO mouvement (id, entreprise_id, produit_id, emplacement_id, type, quantite, utilisateur_id, origine, destination)
      VALUES (gen_random_uuid(), ${entreprise.id}, ${produitId}, ${madina}, 'ENTREE', 1, ${utilisateur.id}, 'FOURNISSEUR', 'CLIENT')`).rejects.toThrow(
      /mouvement_touche_stock_interne/,
    );
  });

  it('GET /stock/emplacements : emplacements réels et virtuels', async () => {
    const { http } = await contexte();
    const reponse = await http.get('/stock/emplacements');
    expect(reponse.status).toBe(200);
    expect(reponse.body.internes.map((e: { chemin: string }) => e.chemin)).toEqual(['Coyah', 'Madina']);
    expect(reponse.body.virtuels.map((v: { nature: string }) => v.nature)).toEqual([
      'FOURNISSEUR',
      'CLIENT',
      'REBUT',
      'INVENTAIRE',
      'TRANSIT',
    ]);
  });

  it('arborescence : refusée tant que le module est coupé, puis chemins complets et cycles refusés', async () => {
    const { http, madina } = await contexte();

    const sansModule = await http.post('/emplacements', { nom: 'Zone A', parentId: madina });
    expect(sansModule.status).toBe(403);
    expect(sansModule.body.code).toBe('MODULE_DESACTIVE');

    expect((await http.patch('/entreprise', { moduleArborescence: true })).status).toBe(200);
    const zone = await http.post('/emplacements', { nom: 'Zone A', parentId: madina });
    expect(zone.status).toBe(201);
    const allee = await http.post('/emplacements', { nom: 'Allée 3', parentId: zone.body.id });
    expect(allee.status).toBe(201);

    const liste = await http.get('/emplacements');
    expect(liste.body.map((e: { chemin: string }) => e.chemin)).toEqual([
      'Coyah',
      'Madina',
      'Madina / Zone A',
      'Madina / Zone A / Allée 3',
    ]);

    const cycle = await http.patch(`/emplacements/${madina}`, { parentId: allee.body.id });
    expect(cycle.status).toBe(409);

    const parentAvecEnfant = await http.patch(`/emplacements/${zone.body.id}/archive`, {});
    expect(parentAvecEnfant.status).toBe(409);
  });

  it('module Lots : coupé, il refuse le suivi par lot et les péremptions ; impossible à couper sous un produit suivi', async () => {
    const { http, produitId } = await contexte();

    const suivi = await http.patch(`/produits/${produitId}`, { suiviParLot: true });
    expect(suivi.status).toBe(200);
    const refus = await http.patch('/entreprise', { moduleLots: false });
    expect(refus.status).toBe(409);
    expect(refus.body.message).toMatch(/Ciment/);

    expect((await http.patch(`/produits/${produitId}`, { suiviParLot: false })).status).toBe(200);
    expect((await http.patch('/entreprise', { moduleLots: false })).status).toBe(200);

    const peremptions = await http.get('/peremptions');
    expect(peremptions.status).toBe(403);
    expect(peremptions.body.code).toBe('MODULE_DESACTIVE');
    const nouveauSuivi = await http.post('/produits', { nom: 'Lait', suiviParLot: true });
    expect(nouveauSuivi.status).toBe(403);

    const entreprise = await http.get('/entreprise');
    expect(entreprise.body).toMatchObject({ moduleLots: false, moduleArborescence: false });
  });
});
