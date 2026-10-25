import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../console/console-test.utils.js';
import { crediterStock } from '../stock/moteur-stock.js';
import { TABLES_SYNCHRONISEES, TAILLE_PAGE } from './synchronisation.service.js';

interface Reponse {
  curseur: string;
  encore: boolean;
  tables: Record<string, { id?: string; nom?: string; quantite?: number }[]>;
  existants: { categories: string[]; marques: string[] };
}

describe('Synchronisation incrémentale (SYNC-02) — intégration réelle, base PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const entrepriseIds: string[] = [];
  const environnement = { ...process.env };

  beforeAll(async () => {
    // Sans marge : un appel suivant ne renvoie que ce qui a changé après le précédent.
    process.env.SYNC_MARGE_MS = '0';
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
    process.env = environnement;
  });

  async function contexte(nom: string) {
    const { entreprise, utilisateur } = await creerEntrepriseAvecAdmin(prisma, nom);
    entrepriseIds.push(entreprise.id);
    const jeton = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    const synchroniser = async (depuis?: string) => {
      const reponse = await request(app.getHttpServer())
        .get('/sync')
        .query(depuis ? { depuis } : {})
        .set('Authorization', `Bearer ${jeton}`);
      expect(reponse.status).toBe(200);
      return reponse.body as Reponse;
    };
    return { entreprise, synchroniser, jeton };
  }

  const pause = () => new Promise((r) => setTimeout(r, 20));

  it('premier appel : instantané complet de l’entreprise, rien des autres', async () => {
    const { entreprise, synchroniser } = await contexte('Synchro A');
    const autre = await contexte('Synchro B');
    const emplacement = await prisma.emplacement.create({ data: { entrepriseId: entreprise.id, nom: 'Boutique Kaloum' } });
    const produit = await prisma.produit.create({ data: { entrepriseId: entreprise.id, nom: 'Huile végétale 5 L' } });
    await prisma.produit.create({ data: { entrepriseId: autre.entreprise.id, nom: 'Produit d’une autre entreprise' } });
    await prisma.$transaction((tx) => crediterStock(tx, { produitId: produit.id, emplacementId: emplacement.id }, 12));

    const r = await synchroniser();
    expect(Object.keys(r.tables).sort()).toEqual([...TABLES_SYNCHRONISEES].sort());
    expect(r.tables.produits.map((p) => p.nom)).toEqual(['Huile végétale 5 L']);
    expect(r.tables.emplacements.map((e) => e.nom)).toEqual(['Boutique Kaloum']);
    expect(r.tables.stock).toEqual([expect.objectContaining({ produitId: produit.id, quantite: 12 })]);
    expect(r.encore).toBe(false);
  });

  it('appel suivant : seulement ce qui a changé, y compris le stock', async () => {
    const { entreprise, synchroniser } = await contexte('Synchro incrément');
    const emplacement = await prisma.emplacement.create({ data: { entrepriseId: entreprise.id, nom: 'Dépôt' } });
    const [riz, sucre] = await Promise.all(
      ['Riz 25 kg', 'Sucre 50 kg'].map((nom) => prisma.produit.create({ data: { entrepriseId: entreprise.id, nom } })),
    );
    await prisma.$transaction((tx) => crediterStock(tx, { produitId: riz.id, emplacementId: emplacement.id }, 5));
    const premier = await synchroniser();
    expect(premier.tables.produits).toHaveLength(2);

    await pause();
    await prisma.produit.update({ where: { id: sucre.id }, data: { nom: 'Sucre 25 kg' } });
    await prisma.$transaction((tx) => crediterStock(tx, { produitId: riz.id, emplacementId: emplacement.id }, 3));
    const second = await synchroniser(premier.curseur);
    expect(second.tables.produits.map((p) => p.nom)).toEqual(['Sucre 25 kg']);
    expect(second.tables.stock).toEqual([expect.objectContaining({ produitId: riz.id, quantite: 8 })]);
    expect(second.tables.emplacements).toEqual([]);

    // Rien de neuf : réponse vide.
    const troisieme = await synchroniser(second.curseur);
    expect(Object.values(troisieme.tables).every((lignes) => lignes.length === 0)).toBe(true);
  });

  it('pagine une table volumineuse sans rien perdre ni dupliquer', async () => {
    const { entreprise, synchroniser } = await contexte('Synchro pages');
    await prisma.categorie.createMany({
      data: Array.from({ length: TAILLE_PAGE + 7 }, (_, i) => ({ entrepriseId: entreprise.id, nom: `Rayon ${i}` })),
    });
    const page1 = await synchroniser();
    expect(page1.tables.categories).toHaveLength(TAILLE_PAGE);
    expect(page1.encore).toBe(true);
    const page2 = await synchroniser(page1.curseur);
    expect(page2.tables.categories).toHaveLength(7);
    expect(page2.encore).toBe(false);
    const ids = new Set([...page1.tables.categories, ...page2.tables.categories].map((c) => c.id));
    expect(ids.size).toBe(TAILLE_PAGE + 7);
  });

  it('suppressions : identifiants encore existants des catégories et marques', async () => {
    const { entreprise, synchroniser } = await contexte('Synchro suppressions');
    const [gardee, supprimee] = await Promise.all(
      ['Boissons', 'Épicerie'].map((nom) => prisma.categorie.create({ data: { entrepriseId: entreprise.id, nom } })),
    );
    const marque = await prisma.marque.create({ data: { entrepriseId: entreprise.id, nom: 'Jumbo' } });
    const premier = await synchroniser();
    await prisma.categorie.delete({ where: { id: supprimee.id } });
    const second = await synchroniser(premier.curseur);
    expect(second.existants.categories).toEqual([gardee.id]);
    expect(second.existants.marques).toEqual([marque.id]);
  });

  it('ventes et mouvements : historique récent seulement', async () => {
    const { entreprise, synchroniser } = await contexte('Synchro historique');
    const emplacement = await prisma.emplacement.create({ data: { entrepriseId: entreprise.id, nom: 'Dépôt' } });
    const produit = await prisma.produit.create({ data: { entrepriseId: entreprise.id, nom: 'Ciment 50 kg' } });
    const utilisateur = await prisma.utilisateur.findFirstOrThrow({ where: { entrepriseId: entreprise.id } });
    const mouvement = (createdAt: Date) =>
      prisma.mouvement.create({
        data: {
          entrepriseId: entreprise.id,
          produitId: produit.id,
          emplacementId: emplacement.id,
          utilisateurId: utilisateur.id,
          type: 'ENTREE',
          origine: 'FOURNISSEUR',
          destination: 'INTERNE',
          quantite: 4,
          createdAt,
        },
      });
    const recent = await mouvement(new Date());
    await mouvement(new Date(Date.now() - 120 * 86_400_000));
    const r = await synchroniser();
    expect(r.tables.mouvements.map((m) => m.id)).toEqual([recent.id]);
  });

  it('refuse un curseur illisible ou falsifié', async () => {
    const { jeton } = await contexte('Synchro curseur');
    for (const depuis of ['pas-un-curseur', Buffer.from('{"inconnue":["2026-01-01",""]}').toString('base64url')]) {
      const reponse = await request(app.getHttpServer()).get('/sync').query({ depuis }).set('Authorization', `Bearer ${jeton}`);
      expect(reponse.status).toBe(400);
    }
  });

  it('exige une session', async () => {
    expect((await request(app.getHttpServer()).get('/sync')).status).toBe(401);
  });
});
