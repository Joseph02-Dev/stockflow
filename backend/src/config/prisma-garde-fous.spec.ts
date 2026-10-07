import { afterEach, describe, expect, it } from 'vitest';
import { PrismaService, avertissementConnexions, optionsPool } from './prisma.service.js';

/** Garde-fous du pool de connexions, vérifiés contre la vraie base PostgreSQL. */
describe('Pool PostgreSQL — garde-fous', () => {
  const sauvegarde = { ...process.env };
  const ouverts: PrismaService[] = [];
  const client = (env: Record<string, string>) => {
    Object.assign(process.env, env);
    const prisma = new PrismaService();
    ouverts.push(prisma);
    return prisma;
  };

  afterEach(async () => {
    await Promise.all(ouverts.splice(0).map((p) => p.$disconnect()));
    for (const cle of ['DB_POOL_MAX', 'DB_DELAI_CONNEXION_MS', 'DB_DELAI_REQUETE_MS']) {
      if (sauvegarde[cle] === undefined) delete process.env[cle];
      else process.env[cle] = sauvegarde[cle];
    }
  });

  it('valeurs par défaut sûres ; valeur invalide remplacée par le défaut', () => {
    expect(optionsPool({ DATABASE_URL: 'postgresql://x' })).toMatchObject({
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000,
      idle_in_transaction_session_timeout: 60000,
      application_name: 'stockflow-api',
    });
    expect(optionsPool({ DB_DELAI_REQUETE_MS: 'abc', DB_DELAI_CONNEXION_MS: '-3' })).toMatchObject({
      statement_timeout: 30000,
      connectionTimeoutMillis: 5000,
    });
  });

  it('dimensionnement : avertit au-delà de la moitié du max_connections de la base', () => {
    expect(avertissementConnexions(10, 1, 100)).toBeNull();
    expect(avertissementConnexions(10, 5, 100)).toBeNull();
    expect(avertissementConnexions(10, 6, 100)).toMatch(/6 processus × DB_POOL_MAX 10 = 60.*\(100\)/);
    expect(avertissementConnexions(10, 3, 25)).toMatch(/= 30/);
  });

  it('une requête SQL trop longue est interrompue par la base', async () => {
    const prisma = client({ DB_DELAI_REQUETE_MS: '200' });
    const debut = Date.now();
    await expect(prisma.$queryRaw`SELECT 1 AS fin FROM pg_sleep(2)`).rejects.toThrow(/statement timeout|canceling statement/i);
    expect(Date.now() - debut).toBeLessThan(1500);
  });

  it('pool saturé : la requête suivante échoue vite au lieu de rester pendue', async () => {
    const prisma = client({ DB_POOL_MAX: '1', DB_DELAI_CONNEXION_MS: '300' });
    // La seule connexion du pool est occupée par une transaction de 1,5 s.
    const occupation = prisma.$transaction(async (tx) => tx.$queryRaw`SELECT 1 AS fin FROM pg_sleep(1.5)`, { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 100));
    const debut = Date.now();
    await expect(prisma.$queryRaw`SELECT 1`).rejects.toThrow(/timeout exceeded when trying to connect/);
    expect(Date.now() - debut).toBeLessThan(1200);
    await occupation;
  });

  it('les connexions sont identifiables dans pg_stat_activity', async () => {
    const prisma = client({});
    const [ligne] = await prisma.$queryRaw<{ nom: string }[]>`SELECT current_setting('application_name') AS nom`;
    expect(ligne.nom).toBe('stockflow-api');
  });
});
