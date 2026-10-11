import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';
import { ReapproPlanificateur } from './reappro-planificateur.js';

describe('Réapprovisionnement et rangement — intégration réelle, base PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let planificateur: ReapproPlanificateur;
  const entrepriseIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    planificateur = moduleRef.get(ReapproPlanificateur);
  });

  afterEach(async () => {
    await nettoyer(prisma, entrepriseIds.splice(0), []);
  });

  afterAll(async () => {
    await app.close();
  });

  async function contexte(modules: Record<string, boolean> = { moduleReapprovisionnement: true, moduleRangement: true }) {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, 'Entreprise Réappro');
    entrepriseIds.push(entreprise.id);
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: modules });
    const jeton = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    const avec = (r: request.Test) => r.set('Authorization', `Bearer ${jeton}`);
    const http = {
      get: (url: string) => avec(request(app.getHttpServer()).get(url)),
      post: (url: string, corps: object = {}) => avec(request(app.getHttpServer()).post(url)).send(corps),
      patch: (url: string, corps: object = {}) => avec(request(app.getHttpServer()).patch(url)).send(corps),
      delete: (url: string) => avec(request(app.getHttpServer()).delete(url)),
    };
    const madina = (await http.post('/emplacements', { nom: 'Madina' })).body.id as string;
    const fournisseur = (await http.post('/fournisseurs', { nom: 'Grossiste Kaloum' })).body.id as string;
    return { entreprise, utilisateur, http, madina, fournisseur };
  }

  it('calcul : brouillon groupé par fournisseur, arrondi au multiple, idempotent', async () => {
    const { http, madina, fournisseur } = await contexte();
    const riz = (await http.post('/produits', { nom: 'Riz 25 kg' })).body.id as string;
    const huile = (await http.post('/produits', { nom: 'Huile 5 L' })).body.id as string;
    const sucre = (await http.post('/produits', { nom: 'Sucre' })).body.id as string;
    await http.post('/mouvements/entree', { produitId: riz, emplacementId: madina, quantite: 4 });
    await http.post(`/fournisseurs/${fournisseur}/produits`, { produitId: huile });

    expect((await http.post('/reapprovisionnement/regles', { produitId: riz, emplacementId: madina, fournisseurId: fournisseur, stockMin: 10, stockMax: 40, multiple: 12 })).status).toBe(201);
    // Sans fournisseur sur la règle : l'unique fournisseur associé au produit.
    expect((await http.post('/reapprovisionnement/regles', { produitId: huile, emplacementId: madina, stockMin: 5, stockMax: 20 })).status).toBe(201);
    // Aucun fournisseur trouvable : ignorée avec un motif.
    expect((await http.post('/reapprovisionnement/regles', { produitId: sucre, emplacementId: madina, stockMin: 1, stockMax: 5 })).status).toBe(201);
    expect((await http.post('/reapprovisionnement/regles', { produitId: sucre, emplacementId: madina, stockMin: 1, stockMax: 5 })).status).toBe(409);
    expect((await http.post('/reapprovisionnement/regles', { produitId: riz, emplacementId: madina, stockMin: 10, stockMax: 5 })).status).toBe(400);

    const etat = await http.get('/reapprovisionnement/regles');
    expect(etat.body.find((r: { produitId: string }) => r.produitId === riz)).toMatchObject({ enStock: 4, previsionnel: 4, aCommander: 36 });

    const calcul = await http.post('/reapprovisionnement/lancer');
    expect(calcul.status).toBe(200);
    expect(calcul.body.commandes).toHaveLength(1);
    expect(calcul.body.ignorees).toEqual([expect.objectContaining({ produit: 'Sucre' })]);
    const commande = await prisma.commandeFournisseur.findUniqueOrThrow({ where: { id: calcul.body.commandes[0].id }, include: { lignes: true } });
    expect(commande).toMatchObject({ statut: 'BROUILLON', automatique: true, fournisseurId: fournisseur });
    expect(Object.fromEntries(commande.lignes.map((l) => [l.produitId, l.quantiteCommandee]))).toEqual({ [riz]: 36, [huile]: 20 });

    // Le brouillon compte dans le prévisionnel : un second calcul ne recommande rien.
    const second = await http.post('/reapprovisionnement/lancer');
    expect(second.body.commandes).toHaveLength(0);
    const apres = await http.get('/reapprovisionnement/regles');
    expect(apres.body.find((r: { produitId: string }) => r.produitId === riz)).toMatchObject({ enCommande: 36, previsionnel: 40, aCommander: 0 });
  });

  it('le calcul quotidien traite les entreprises qui ont le module, au nom de leur administrateur', async () => {
    const { entreprise, utilisateur, http, madina, fournisseur } = await contexte();
    const ciment = (await http.post('/produits', { nom: 'Ciment' })).body.id as string;
    await http.post('/reapprovisionnement/regles', { produitId: ciment, emplacementId: madina, fournisseurId: fournisseur, stockMin: 50, stockMax: 200 });
    const sansModule = await contexte({ moduleReapprovisionnement: false, moduleRangement: false });
    const autre = (await sansModule.http.post('/produits', { nom: 'Fer' })).body.id as string;
    await prisma.regleReapprovisionnement.create({
      data: { entrepriseId: sansModule.entreprise.id, produitId: autre, emplacementId: sansModule.madina, fournisseurId: sansModule.fournisseur, stockMin: 1, stockMax: 2 },
    });

    await planificateur.calculQuotidien();

    const commandes = await prisma.commandeFournisseur.findMany({ where: { entrepriseId: { in: [entreprise.id, sansModule.entreprise.id] } } });
    expect(commandes).toHaveLength(1);
    expect(commandes[0]).toMatchObject({ entrepriseId: entreprise.id, utilisateurId: utilisateur.id, automatique: true });
    expect((await prisma.entreprise.findUniqueOrThrow({ where: { id: entreprise.id } })).dernierReapproAt).not.toBeNull();
  });

  it('rangement : proposé à la saisie, appliqué à la réception de commande ; le prévisionnel compte les sous-emplacements', async () => {
    const { entreprise, http, madina, fournisseur } = await contexte({ moduleReapprovisionnement: true, moduleRangement: true });
    await prisma.entreprise.update({ where: { id: entreprise.id }, data: { moduleArborescence: true } });
    const zone = (await http.post('/emplacements', { nom: 'Zone froid', parentId: madina })).body.id as string;
    const categorie = (await http.post('/categories', { nom: 'Frais' })).body.id as string;
    const yaourt = (await http.post('/produits', { nom: 'Yaourt', categorieId: categorie })).body.id as string;

    expect((await http.post('/rangement/regles', { categorieId: categorie, emplacementReceptionId: madina, emplacementId: zone })).status).toBe(201);
    expect((await http.post('/rangement/regles', { produitId: yaourt, categorieId: categorie, emplacementId: zone })).status).toBe(400);
    const proposition = await http.get(`/rangement/proposition?produit_id=${yaourt}&emplacement_id=${madina}`);
    expect(proposition.body).toEqual({ emplacement: { id: zone, nom: 'Zone froid' } });

    await http.post('/reapprovisionnement/regles', { produitId: yaourt, emplacementId: madina, fournisseurId: fournisseur, stockMin: 10, stockMax: 30 });
    const calcul = await http.post('/reapprovisionnement/lancer');
    const commandeId = calcul.body.commandes[0].id as string;
    await http.post(`/commandes/${commandeId}/envoyer`);
    expect((await http.post(`/commandes/${commandeId}/recevoir`, {})).status).toBe(201);

    const stocks = await prisma.stock.findMany({ where: { produitId: yaourt }, select: { emplacementId: true, quantite: true } });
    expect(stocks).toEqual([{ emplacementId: zone, quantite: 30 }]);
    // Rangé dans une zone fille : la règle de Madina le voit, rien à recommander.
    const etat = await http.get('/reapprovisionnement/regles');
    expect(etat.body[0]).toMatchObject({ enStock: 30, aCommander: 0 });
  });

  it('modules coupés : routes refusées, aucune proposition de rangement', async () => {
    const { http, madina } = await contexte({ moduleReapprovisionnement: false, moduleRangement: false });
    const produit = (await http.post('/produits', { nom: 'Savon' })).body.id as string;
    expect((await http.get('/reapprovisionnement/regles')).body.code).toBe('MODULE_DESACTIVE');
    expect((await http.post('/reapprovisionnement/lancer')).status).toBe(403);
    expect((await http.get(`/rangement/proposition?produit_id=${produit}&emplacement_id=${madina}`)).status).toBe(403);
  });
});
