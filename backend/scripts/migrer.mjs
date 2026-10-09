// Migrations au démarrage, appliquées par Node.js (pilote pg), avec
// diagnostic réseau et nouvelles tentatives.
//
// Pourquoi pas `prisma migrate deploy` ici : sur Render (2026-10-09), les
// adresses IPv6 de la base Neon sont sans route (ENETUNREACH) et le moteur
// de migration de Prisma (binaire Rust) ne se rabat pas sur l'IPv4 (P1001) ;
// forcé en IPv4, il n'arrive plus à s'authentifier sans le nom d'hôte
// (P1000). Node.js, lui, se rabat sur l'IPv4 et garde le nom d'hôte (SNI) :
// c'est lui qui fait déjà tourner l'API.
//
// Compatibilité Prisma : même table `_prisma_migrations`, même somme de
// contrôle (SHA-256 du fichier migration.sql), même verrou consultatif,
// une migration = un script exécuté d'un bloc. `prisma migrate deploy` et
// `prisma migrate status` reconnaissent donc les migrations appliquées ici
// (vérifié en local), et Railway peut continuer d'utiliser Prisma.
//
// Le journal n'affiche jamais l'identifiant ni le mot de passe.
//
// Usage : node scripts/migrer.mjs && npm run start:prod
import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { readdir, readFile } from 'node:fs/promises';
import net from 'node:net';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import pg from 'pg';

const TENTATIVES = Number(process.env.MIGRATION_TENTATIVES ?? 5);
const PAUSE_MS = Number(process.env.MIGRATION_PAUSE_MS ?? 10_000);
const DELAI_TCP_MS = 8_000;
const DOSSIER = join(import.meta.dirname, '..', 'prisma', 'migrations');
/** Verrou consultatif de Prisma Migrate : jamais deux migrations en même temps. */
const VERROU = 72707369;

function journal(message) {
  console.log(`[migrations] ${message}`);
}

/** Connexion TCP brute : prouve que le réseau mène jusqu'au serveur. */
function sonderTcp(adresse, famille, port) {
  return new Promise((resoudre) => {
    const debut = Date.now();
    const socket = net.connect({ host: adresse, port, family: famille });
    const fin = (resultat) => {
      socket.destroy();
      resoudre(`${resultat} en ${Date.now() - debut} ms`);
    };
    socket.setTimeout(DELAI_TCP_MS, () => fin('délai dépassé'));
    socket.once('connect', () => fin('ouverte'));
    socket.once('error', (e) => fin(`erreur ${e.code ?? e.message}`));
  });
}

async function diagnostiquer() {
  let url;
  try {
    url = new URL(process.env.DATABASE_URL ?? '');
  } catch {
    journal('DATABASE_URL absente ou illisible.');
    return;
  }
  const port = Number(url.port || 5432);
  const parametres = [...url.searchParams.keys()].join(', ') || 'aucun';
  journal(`hôte ${url.hostname}, port ${port}, paramètres : ${parametres}`);
  try {
    const adresses = await lookup(url.hostname, { all: true });
    for (const { address, family } of adresses) {
      journal(`IPv${family} ${address} : connexion TCP ${await sonderTcp(address, family, port)}`);
    }
  } catch (e) {
    journal(`résolution DNS impossible : ${e.code ?? e.message}`);
  }
}

/** Migrations du dépôt, dans l'ordre de leur nom (horodaté). */
async function migrationsDuDepot() {
  const entrees = await readdir(DOSSIER, { withFileTypes: true });
  const noms = entrees.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  return Promise.all(
    noms.map(async (nom) => {
      const sql = await readFile(join(DOSSIER, nom, 'migration.sql'), 'utf8');
      return { nom, sql, somme: createHash('sha256').update(sql).digest('hex') };
    }),
  );
}

/** Échec qu'une nouvelle tentative ne corrigera pas (SQL, migration en échec). */
class EchecDefinitif extends Error {}

async function appliquer(migrations) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [VERROU]);
    await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);
    const { rows } = await client.query(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"',
    );
    const enEchec = rows.filter((r) => !r.finished_at && !r.rolled_back_at);
    if (enEchec.length > 0) {
      throw new EchecDefinitif(
        `migration en échec à résoudre d'abord (prisma migrate resolve) : ${enEchec.map((r) => r.migration_name).join(', ')}`,
      );
    }
    const appliquees = new Map(
      rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => [r.migration_name, r.checksum]),
    );
    for (const { nom, somme } of migrations) {
      if (appliquees.has(nom) && appliquees.get(nom) !== somme) journal(`attention : ${nom} modifiée après application`);
    }
    const aFaire = migrations.filter((m) => !appliquees.has(m.nom));
    journal(`${migrations.length} migrations dans le dépôt, ${aFaire.length} à appliquer`);
    for (const { nom, sql, somme } of aFaire) {
      const id = randomUUID();
      await client.query(
        'INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES ($1, $2, $3, now(), 0)',
        [id, somme, nom],
      );
      try {
        await client.query(sql);
      } catch (e) {
        await client.query('UPDATE "_prisma_migrations" SET logs = $2 WHERE id = $1', [id, String(e.message)]);
        throw new EchecDefinitif(`${nom} : ${e.message}`);
      }
      await client.query(
        'UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1',
        [id],
      );
      journal(`appliquée : ${nom}`);
    }
    journal('base à jour.');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [VERROU]).catch(() => {});
    await client.end().catch(() => {});
  }
}

await diagnostiquer();
const migrations = await migrationsDuDepot();

for (let tentative = 1; tentative <= TENTATIVES; tentative++) {
  journal(`tentative ${tentative}/${TENTATIVES}`);
  try {
    await appliquer(migrations);
    process.exit(0);
  } catch (e) {
    if (e instanceof EchecDefinitif) {
      journal(`échec : ${e.message}`);
      process.exit(1);
    }
    journal(`connexion impossible : ${e.code ?? ''} ${e.message}`);
    if (tentative < TENTATIVES) {
      journal(`nouvelle tentative dans ${PAUSE_MS / 1000} s`);
      await pause(PAUSE_MS);
    }
  }
}
journal('migrations impossibles après toutes les tentatives : arrêt.');
process.exit(1);
