import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterOperateur, creerEntrepriseAvecAdmin, creerOperateur, nettoyer } from './console-test.utils.js';

const JOUR_MS = 24 * 60 * 60 * 1000;

describe('Console — consultation des entreprises (intégration réelle)', () => {
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
    await nettoyer(prisma, entrepriseIds.splice(0), operateurIds.splice(0));
  });

  afterAll(async () => {
    await app.close();
  });

  async function preparerOperateur() {
    const operateur = await creerOperateur(prisma);
    operateurIds.push(operateur.id);
    return { operateur, token: await connecterOperateur(app, operateur.email) };
  }

  /**
   * Entreprise A : 2 emplacements actifs + 1 archivé, 3 utilisateurs,
   * 2 références actives + 1 archivée, 4 mouvements récents + 1 vieux de 40 j.
   * Entreprise B : 1 emplacement, 1 utilisateur, aucun produit.
   */
  async function preparerDeuxEntreprises() {
    const a = await creerEntrepriseAvecAdmin(prisma, 'Quincaillerie A');
    const b = await creerEntrepriseAvecAdmin(prisma, 'Dépôt B');
    entrepriseIds.push(a.entreprise.id, b.entreprise.id);
    const idA = a.entreprise.id;

    const [empA1] = await Promise.all([
      prisma.emplacement.create({ data: { entrepriseId: idA, nom: 'Madina' } }),
      prisma.emplacement.create({ data: { entrepriseId: idA, nom: 'Kaloum' } }),
      prisma.emplacement.create({ data: { entrepriseId: idA, nom: 'Ancien', archive: true } }),
      prisma.emplacement.create({ data: { entrepriseId: b.entreprise.id, nom: 'Unique' } }),
    ]);
    for (const n of [2, 3]) {
      await prisma.utilisateur.create({
        data: { entrepriseId: idA, email: `${idA}-${n}@stockflow.dev`, nom: `U${n}`, passwordHash: 'x', role: 'GESTIONNAIRE' },
      });
    }
    const [produitA] = await Promise.all([
      prisma.produit.create({ data: { entrepriseId: idA, nom: 'Ciment' } }),
      prisma.produit.create({ data: { entrepriseId: idA, nom: 'Fer' } }),
      prisma.produit.create({ data: { entrepriseId: idA, nom: 'Archivé', archive: true } }),
    ]);
    const base = { entrepriseId: idA, produitId: produitA.id, emplacementId: empA1.id, utilisateurId: a.utilisateur.id };
    for (let i = 0; i < 4; i++) {
      await prisma.mouvement.create({ data: { ...base, type: 'ENTREE', quantite: 10 + i } });
    }
    await prisma.mouvement.create({ data: { ...base, type: 'SORTIE', quantite: 1, createdAt: new Date(Date.now() - 40 * JOUR_MS) } });
    return { a, b };
  }

  it('renvoie des agrégats corrects pour deux entreprises aux données différentes', async () => {
    const { token } = await preparerOperateur();
    const { a, b } = await preparerDeuxEntreprises();

    const reponse = await request(app.getHttpServer()).get('/console/entreprises').set('Authorization', `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    const ligneA = reponse.body.find((l: { id: string }) => l.id === a.entreprise.id);
    const ligneB = reponse.body.find((l: { id: string }) => l.id === b.entreprise.id);
    expect(ligneA).toMatchObject({
      nom: 'Quincaillerie A',
      emplacements: 2,
      utilisateurs: 3,
      references: 2,
      mouvements30j: 4,
      statut: 'ACTIVE',
      etat: 'ACTIVE',
    });
    expect(ligneA.derniereActivite).not.toBeNull();
    expect(ligneB).toMatchObject({
      nom: 'Dépôt B',
      emplacements: 1,
      utilisateurs: 1,
      references: 0,
      mouvements30j: 0,
      etat: 'JAMAIS_DEMARREE',
    });
  });

  it('filtre la liste par recherche et par état', async () => {
    const { token } = await preparerOperateur();
    const { a, b } = await preparerDeuxEntreprises();

    const parNom = await request(app.getHttpServer())
      .get('/console/entreprises?recherche=quincaillerie a')
      .set('Authorization', `Bearer ${token}`);
    expect(parNom.body.map((l: { id: string }) => l.id)).toContain(a.entreprise.id);
    expect(parNom.body.map((l: { id: string }) => l.id)).not.toContain(b.entreprise.id);

    const parEtat = await request(app.getHttpServer())
      .get('/console/entreprises?etat=JAMAIS_DEMARREE')
      .set('Authorization', `Bearer ${token}`);
    expect(parEtat.body.every((l: { etat: string }) => l.etat === 'JAMAIS_DEMARREE')).toBe(true);
    expect(parEtat.body.map((l: { id: string }) => l.id)).toContain(b.entreprise.id);

    const etatInconnu = await request(app.getHttpServer())
      .get('/console/entreprises?etat=SUPPRIMEE')
      .set('Authorization', `Bearer ${token}`);
    expect(etatInconnu.status).toBe(400);
  });

  it('compte ces entreprises dans l’aperçu et la répartition des mouvements', async () => {
    const { token } = await preparerOperateur();
    const { a } = await preparerDeuxEntreprises();

    const reponse = await request(app.getHttpServer()).get('/console/apercu').set('Authorization', `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.kpi.entreprisesActives).toBeGreaterThanOrEqual(2);
    expect(reponse.body.kpi.mouvements30j).toBeGreaterThanOrEqual(4);
    const repartition = reponse.body.repartitionMouvements;
    const totalReparti =
      repartition.entreprises.reduce((n: number, e: { mouvements: number }) => n + e.mouvements, 0) +
      repartition.autres.mouvements;
    expect(totalReparti).toBe(reponse.body.kpi.mouvements30j);
    expect(repartition.entreprises.length).toBeLessThanOrEqual(5);
    expect(
      repartition.entreprises.some((e: { id: string; mouvements: number }) => e.id === a.entreprise.id && e.mouvements === 4) ||
        repartition.autres.nombreEntreprises > 0,
    ).toBe(true);
  });

  it('renvoie la fiche sans aucun secret et journalise la consultation', async () => {
    const { operateur, token } = await preparerOperateur();
    const { a } = await preparerDeuxEntreprises();

    const reponse = await request(app.getHttpServer())
      .get(`/console/entreprises/${a.entreprise.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.synthese).toMatchObject({ utilisateurs: 3, emplacements: 2, references: 2, mouvements30j: 4, mouvementsTotal: 5 });
    expect(reponse.body.emplacements).toHaveLength(3);
    const texte = JSON.stringify(reponse.body);
    expect(texte).not.toContain('passwordHash');
    expect(texte).not.toContain('tokenHash');

    const journal = await prisma.journalAudit.findMany({
      where: { operateurId: operateur.id, entrepriseId: a.entreprise.id },
    });
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ action: 'CONSULTATION_ENTREPRISE', detail: 'Fiche entreprise' });
  });

  it('pagine l’historique des mouvements et le stock', async () => {
    const { token } = await preparerOperateur();
    const { a } = await preparerDeuxEntreprises();
    const id = a.entreprise.id;

    const page1 = await request(app.getHttpServer())
      .get(`/console/entreprises/${id}/mouvements?page=1&taille=2`)
      .set('Authorization', `Bearer ${token}`);
    expect(page1.status).toBe(200);
    expect(page1.body).toMatchObject({ total: 5, page: 1, taille: 2 });
    expect(page1.body.elements).toHaveLength(2);

    const page3 = await request(app.getHttpServer())
      .get(`/console/entreprises/${id}/mouvements?page=3&taille=2`)
      .set('Authorization', `Bearer ${token}`);
    expect(page3.body.elements).toHaveLength(1);

    const stock = await request(app.getHttpServer())
      .get(`/console/entreprises/${id}/stock`)
      .set('Authorization', `Bearer ${token}`);
    expect(stock.body.total).toBe(2);

    const tropGrand = await request(app.getHttpServer())
      .get(`/console/entreprises/${id}/mouvements?taille=500`)
      .set('Authorization', `Bearer ${token}`);
    expect(tropGrand.status).toBe(400);
  });

  it('renvoie 404 pour une entreprise inconnue et 400 pour un identifiant mal formé', async () => {
    const { token } = await preparerOperateur();

    const inconnue = await request(app.getHttpServer())
      .get('/console/entreprises/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(inconnue.status).toBe(404);

    const malForme = await request(app.getHttpServer())
      .get('/console/entreprises/pas-un-uuid')
      .set('Authorization', `Bearer ${token}`);
    expect(malForme.status).toBe(400);
  });
});
