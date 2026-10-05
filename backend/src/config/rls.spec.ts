import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Row-Level Security : l'isolation tient au niveau de PostgreSQL, même
 * pour une requête SANS filtre « entreprise_id » (l'oubli que la RLS doit
 * rattraper). Exige le rôle restreint (scripts/rls/creer-role-application.sql)
 * dans DATABASE_URL_APPLICATION ; sans lui, rien à vérifier.
 *
 * Le contexte est posé ici explicitement sur la connexion : c'est le
 * contrat que l'application devra respecter (étape 2, à décider).
 */
type ContexteBaseDeDonnees = { entrepriseId: string } | { systeme: true };
const URL_APPLICATION = process.env.DATABASE_URL_APPLICATION;

describe.skipIf(!URL_APPLICATION)('Row-Level Security PostgreSQL — rôle restreint de l’application', () => {
  const proprietaire = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  let contexte: ContexteBaseDeDonnees = { systeme: true };
  const client = new pg.Client({ connectionString: URL_APPLICATION });
  /** Requête du rôle restreint, sous le contexte courant (posé pour la transaction seulement). */
  const pool = {
    async query(sql: string, parametres: unknown[] = []) {
      const [entreprise, systeme] = 'systeme' in contexte ? ['', 'oui'] : [contexte.entrepriseId, 'non'];
      await client.query('BEGIN');
      try {
        await client.query("SELECT set_config('app.entreprise_id', $1, true), set_config('app.systeme', $2, true)", [entreprise, systeme]);
        const resultat = await client.query(sql, parametres);
        await client.query('COMMIT');
        return resultat;
      } catch (erreur) {
        await client.query('ROLLBACK');
        throw erreur;
      }
    },
  };
  const ids = { a: crypto.randomUUID(), b: crypto.randomUUID() };

  beforeAll(async () => {
    await client.connect();
    // Données posées par le propriétaire (migrations), hors RLS.
    for (const [cle, id] of Object.entries(ids)) {
      await proprietaire.query('INSERT INTO entreprise (id, nom) VALUES ($1, $2)', [id, `RLS ${cle}`]);
      await proprietaire.query(
        'INSERT INTO produit (id, entreprise_id, nom) VALUES ($1, $2, $3), ($4, $2, $5)',
        [crypto.randomUUID(), id, `Produit 1 ${cle}`, crypto.randomUUID(), `Produit 2 ${cle}`],
      );
    }
    const produitA = (await proprietaire.query('SELECT id FROM produit WHERE entreprise_id = $1 LIMIT 1', [ids.a])).rows[0].id;
    const emplacement = crypto.randomUUID();
    await proprietaire.query('INSERT INTO emplacement (id, entreprise_id, nom) VALUES ($1, $2, $3)', [emplacement, ids.a, 'Dépôt A']);
    await proprietaire.query('INSERT INTO stock (produit_id, emplacement_id, quantite) VALUES ($1, $2, 5)', [produitA, emplacement]);
  });

  afterAll(async () => {
    await proprietaire.query('DELETE FROM stock WHERE produit_id IN (SELECT id FROM produit WHERE entreprise_id = ANY($1))', [Object.values(ids)]);
    await proprietaire.query('DELETE FROM emplacement WHERE entreprise_id = ANY($1)', [Object.values(ids)]);
    await proprietaire.query('DELETE FROM produit WHERE entreprise_id = ANY($1)', [Object.values(ids)]);
    await proprietaire.query('DELETE FROM entreprise WHERE id = ANY($1)', [Object.values(ids)]);
    await Promise.all([proprietaire.end(), client.end()]);
  });

  const compter = async (sql: string) => Number((await pool.query(sql)).rows[0].n);

  it('une requête sans filtre ne voit que l’entreprise du contexte, tables filles comprises', async () => {
    contexte = { entrepriseId: ids.a };
    expect(await compter(`SELECT count(*) AS n FROM produit WHERE nom LIKE 'Produit % a'`)).toBe(2);
    expect(await compter(`SELECT count(*) AS n FROM produit WHERE nom LIKE 'Produit % b'`)).toBe(0);
    expect(await compter('SELECT count(*) AS n FROM entreprise')).toBe(1);
    expect(await compter('SELECT count(*) AS n FROM stock')).toBe(1);

    contexte = { entrepriseId: ids.b };
    expect(await compter(`SELECT count(*) AS n FROM produit WHERE nom LIKE 'Produit % a'`)).toBe(0);
    expect(await compter('SELECT count(*) AS n FROM stock')).toBe(0);
  });

  it('écritures : impossible d’insérer, modifier ou supprimer chez une autre entreprise', async () => {
    contexte = { entrepriseId: ids.a };
    await expect(
      pool.query('INSERT INTO produit (id, entreprise_id, nom) VALUES ($1, $2, $3)', [crypto.randomUUID(), ids.b, 'Intrus']),
    ).rejects.toThrow(/row-level security/);
    // UPDATE / DELETE sans filtre : seules les lignes visibles sont touchées.
    await pool.query(`UPDATE produit SET nom = nom || ' (vu)'`);
    await pool.query('DELETE FROM stock');
    const intacts = await proprietaire.query(`SELECT count(*) AS n FROM produit WHERE entreprise_id = $1 AND nom LIKE '%(vu)'`, [ids.b]);
    expect(Number(intacts.rows[0].n)).toBe(0);
    // Déplacer une ligne vers une autre entreprise : refusé (WITH CHECK).
    await expect(pool.query('UPDATE produit SET entreprise_id = $1', [ids.b])).rejects.toThrow(/row-level security/);
  });

  it('contexte système : accès à toutes les entreprises ; aucun contexte : aucune ligne', async () => {
    contexte = { systeme: true };
    expect(await compter(`SELECT count(*) AS n FROM produit WHERE nom LIKE 'Produit %'`)).toBeGreaterThanOrEqual(4);
    // Connexion brute du rôle restreint, sans passer par le pool isolé.
    const brut = new pg.Client({ connectionString: URL_APPLICATION });
    await brut.connect();
    expect(Number((await brut.query('SELECT count(*) AS n FROM produit')).rows[0].n)).toBe(0);
    await brut.end();
  });

  it('le contexte, posé par transaction, ne survit pas à la transaction suivante', async () => {
    for (let i = 0; i < 6; i++) {
      contexte = { entrepriseId: i % 2 ? ids.a : ids.b };
      expect(await compter('SELECT count(*) AS n FROM entreprise')).toBe(1);
      const nom = (await pool.query('SELECT nom FROM entreprise')).rows[0].nom;
      expect(nom).toBe(i % 2 ? 'RLS a' : 'RLS b');
    }
  });
});
