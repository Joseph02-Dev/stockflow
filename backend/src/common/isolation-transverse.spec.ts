import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { connecterClient, creerEntrepriseAvecAdmin, nettoyer } from '../modules/console/console-test.utils.js';

/**
 * Garde-fou d'isolation multi-entreprise, transverse : au lieu d'un test
 * par module, toutes les routes enregistrées qui prennent un identifiant
 * sont découvertes automatiquement, puis attaquées par l'entreprise B avec
 * CHAQUE identifiant de l'entreprise A (et un corps de requête valide).
 *
 * Invariants vérifiés :
 * 1. B n'obtient jamais de réponse 2xx sur une ressource de A ;
 * 2. aucune réponse ne contient de donnée de A (marqueur dans ses libellés) ;
 * 3. la base est identique, au bit près, avant et après l'attaque.
 *
 * Une nouvelle route ajoutée sans filtre par entreprise fait échouer ce
 * test, même si personne n'a pensé à lui écrire un test d'isolation.
 */
const MARQUEUR = 'SECRET-A';

/** Corps valides par route : sans eux, la validation (400) masquerait une fuite. */
const CORPS: Record<string, object> = {
  'PATCH /categories/:id': { nom: 'Pirate' },
  'PATCH /marques/:id': { nom: 'Pirate' },
  'PATCH /clients/:id': { nom: 'Pirate' },
  'PATCH /emplacements/:id': { nom: 'Pirate' },
  'PATCH /fournisseurs/:id': { nom: 'Pirate' },
  'PATCH /produits/:id': { nom: 'Pirate' },
  'PATCH /retours-fournisseur/:id/avoir': { statut: 'REFUSE' },
  'PATCH /users/:id/role': { role: 'GESTIONNAIRE' },
  'POST /clients/:id/reglements': { montant: 1000, mode: 'ESPECES' },
  'POST /ventes/:id/reglements': { montant: 1000, mode: 'ESPECES' },
  'POST /ventes/:id/annuler': { motif: 'Tentative pirate' },
  'POST /pertes/:id/annuler': { motif: 'Tentative pirate' },
  'POST /commandes/:id/annuler': { motif: 'Tentative pirate' },
  'PATCH /inventaires/:id/lignes/:ligneId': { quantiteComptee: 1 },
};

/** Routes hors périmètre client : console opérateur (secret distinct), lecture binaire publique. */
const EXCLUES = [/^\S+ \/console\//];

describe('Isolation multi-entreprise transverse — toutes les routes à identifiant', () => {
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

  afterAll(async () => {
    await nettoyer(prisma, entrepriseIds, []);
    await app.close();
  });

  async function entreprise(nom: string) {
    const { entreprise: e, utilisateur } = await creerEntrepriseAvecAdmin(prisma, nom);
    entrepriseIds.push(e.id);
    const token = (await connecterClient(app, utilisateur.email)).body.accessToken as string;
    const appel = (methode: string, url: string, corps?: object) =>
      (request(app.getHttpServer()) as unknown as Record<string, (u: string) => request.Test>)
        [methode.toLowerCase()](url)
        .set('Authorization', `Bearer ${token}`)
        .send(corps ?? {});
    return { id: e.id, appel };
  }

  /** Entreprise A : au moins une ressource de chaque sorte, marquée. */
  async function peupler(a: Awaited<ReturnType<typeof entreprise>>) {
    const c = async (url: string, corps: object) => {
      const r = await a.appel('POST', url, corps);
      expect(r.status, `${url} ${JSON.stringify(r.body)}`).toBeLessThan(300);
      return r.body;
    };
    const depot = await c('/emplacements', { nom: `Dépôt ${MARQUEUR}` });
    await c('/emplacements', { nom: `Réserve ${MARQUEUR}` });
    const categorie = await c('/categories', { nom: `Ciments ${MARQUEUR}` });
    await c('/marques', { nom: `Marque ${MARQUEUR}` });
    const fournisseur = await c('/fournisseurs', { nom: `Fournisseur ${MARQUEUR}` });
    const produit = await c('/produits', { nom: `Ciment ${MARQUEUR}`, prixAchat: 1000, prixVente: 1300, categorieId: categorie.id, seuilAlerte: 500 });
    const riz = await c('/produits', { nom: `Riz ${MARQUEUR}`, prixAchat: 2000, prixVente: 2600, suiviParLot: true });
    await c(`/fournisseurs/${fournisseur.id}/produits`, { produitId: produit.id });
    await c('/mouvements/entree', { produitId: produit.id, emplacementId: depot.id, quantite: 100 });
    await c('/mouvements/entree', { produitId: riz.id, emplacementId: depot.id, quantite: 10, numeroLot: 'L1', datePeremption: '2020-01-01' });
    const client = await c('/clients', { nom: `Client ${MARQUEUR}`, telephone: '+224 622 00 00 00' });
    const vente = await c('/ventes', { clientId: client.id, emplacementId: depot.id, modePaiement: 'CREDIT', lignes: [{ produitId: produit.id, quantite: 5 }] });
    await c(`/ventes/${vente.id}/reglements`, { montant: 1000, mode: 'ESPECES' });
    await c(`/ventes/${vente.id}/retour`, { lignes: [{ ligneVenteId: vente.lignes[0].id, quantite: 1 }], etat: 'REMISE_EN_STOCK', compensation: 'REMBOURSEMENT' });
    await c('/pertes', { produitId: produit.id, emplacementId: depot.id, quantite: 2, motif: 'VOL', commentaire: MARQUEUR });
    await c('/retours-fournisseur', { fournisseurId: fournisseur.id, emplacementId: depot.id, motif: `Retour ${MARQUEUR}`, lignes: [{ produitId: produit.id, quantite: 1 }] });
    await c('/commandes', { fournisseurId: fournisseur.id, emplacementId: depot.id, lignes: [{ produitId: produit.id, quantiteCommandee: 10 }] });
    await c('/inventaires', { emplacementId: depot.id });
  }

  /** Tous les identifiants appartenant à A, entités filles comprises. */
  async function identifiantsDe(entrepriseId: string): Promise<string[]> {
    const lignes = await prisma.$queryRaw<{ id: string }[]>`
      WITH proprietaires AS (
        SELECT id FROM alerte WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM categorie WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM client WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM commande_fournisseur WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM emplacement WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM fournisseur WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM import_catalogue WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM inventaire WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM lot WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM marque WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM mouvement WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM produit WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM retour_client WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM retour_fournisseur WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM utilisateur WHERE entreprise_id = ${entrepriseId}
        UNION ALL SELECT id FROM vente WHERE entreprise_id = ${entrepriseId}
      )
      SELECT id FROM proprietaires
      UNION ALL SELECT lv.id FROM ligne_vente lv JOIN vente v ON v.id = lv.vente_id WHERE v.entreprise_id = ${entrepriseId}
      UNION ALL SELECT r.id FROM reglement r JOIN vente v ON v.id = r.vente_id WHERE v.entreprise_id = ${entrepriseId}
      UNION ALL SELECT il.id FROM inventaire_ligne il JOIN inventaire i ON i.id = il.inventaire_id WHERE i.entreprise_id = ${entrepriseId}
      UNION ALL SELECT cl.id FROM commande_ligne cl JOIN commande_fournisseur c ON c.id = cl.commande_id WHERE c.entreprise_id = ${entrepriseId}`;
    return lignes.map((l) => l.id);
  }

  /** Empreinte de toutes les tables métier (hors sessions et compteurs de connexion). */
  async function empreinte(): Promise<Record<string, string>> {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('_prisma_migrations', 'refresh_token', 'journal_audit')`;
    const resultat: Record<string, string> = {};
    for (const { table_name } of tables) {
      const [{ md5 }] = await prisma.$queryRawUnsafe<{ md5: string | null }[]>(
        `SELECT md5(string_agg(t::text, '|' ORDER BY t::text)) AS md5 FROM "${table_name}" t`,
      );
      resultat[table_name] = md5 ?? '';
    }
    return resultat;
  }

  function routesAIdentifiant(): string[] {
    const express = app.getHttpAdapter().getInstance();
    const pile = (express.router ?? express._router).stack as { route?: { path: string; methods: Record<string, boolean> } }[];
    return pile
      .filter((couche) => couche.route && couche.route.path.includes(':'))
      .flatMap((couche) => Object.keys(couche.route!.methods).map((m) => `${m.toUpperCase()} ${couche.route!.path}`))
      .filter((route) => !EXCLUES.some((motif) => motif.test(route)));
  }

  it('aucune route à identifiant ne laisse l’entreprise B lire ou modifier une ressource de A', async () => {
    const a = await entreprise(`Entreprise ${MARQUEUR}`);
    const b = await entreprise('Entreprise B');
    await peupler(a);
    const ids = await identifiantsDe(a.id);
    expect(ids.length).toBeGreaterThan(20);
    const produits = (await prisma.produit.findMany({ where: { entrepriseId: a.id }, select: { id: true } })).map((p) => p.id);
    const lignesInventaire = (
      await prisma.inventaireLigne.findMany({ where: { inventaire: { entrepriseId: a.id } }, select: { id: true } })
    ).map((l) => l.id);
    expect(lignesInventaire.length).toBeGreaterThan(0);

    const routes = routesAIdentifiant();
    expect(routes.length).toBeGreaterThanOrEqual(40);
    const avant = await empreinte();
    const fuites: string[] = [];
    let appels = 0;

    for (const route of routes) {
      const [methode, chemin] = route.split(' ');
      const parametres = chemin.match(/:\w+/g) ?? [];
      // Routes à deux identifiants : le second parcourt aussi tous les identifiants de A.
      const seconds = parametres[1] === ':produitId' ? produits : parametres[1] === ':ligneId' ? lignesInventaire : ids;
      const combinaisons = parametres.length === 1 ? ids.map((id) => [id]) : ids.flatMap((x) => seconds.map((y) => [x, y]));
      for (const valeurs of combinaisons) {
        let url = chemin;
        parametres.forEach((p, i) => (url = url.replace(p, valeurs[i])));
        const r = await b.appel(methode, url, CORPS[route]);
        appels++;
        const texte = typeof r.text === 'string' ? r.text : '';
        if (r.status < 300 || texte.includes(MARQUEUR)) fuites.push(`${route} → ${url} : ${r.status}`);
      }
    }

    expect(fuites, `Fuites détectées :\n${fuites.join('\n')}`).toEqual([]);
    expect(await empreinte()).toEqual(avant);
    expect(appels).toBeGreaterThan(routes.length * 20);

    // Témoin : les mêmes ressources restent accessibles à leur propriétaire.
    const produit = await prisma.produit.findFirstOrThrow({ where: { entrepriseId: a.id } });
    const lecture = await a.appel('GET', `/produits/${produit.id}`);
    expect(lecture.status).toBe(200);
    expect(lecture.text).toContain(MARQUEUR);
  }, 300_000);
});
