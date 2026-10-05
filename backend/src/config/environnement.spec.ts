import { describe, expect, it } from 'vitest';
import { diagnostiquerEnvironnement } from './environnement.js';

const SECRET = 'a'.repeat(64);
const complet = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app@db/stockflow',
  JWT_ACCESS_SECRET: SECRET,
  JWT_REFRESH_SECRET: 'b'.repeat(64),
  JWT_CONSOLE_SECRET: 'c'.repeat(64),
  FRONTEND_URL: 'https://stockflow.vercel.app',
};

describe('Validation de l’environnement au démarrage', () => {
  it('configuration complète : ni erreur ni avertissement', () => {
    expect(diagnostiquerEnvironnement(complet)).toEqual({ erreurs: [], avertissements: [] });
  });

  it('variable obligatoire absente ou vide : erreur bloquante, nommée, sans valeur', () => {
    const { erreurs } = diagnostiquerEnvironnement({ ...complet, JWT_ACCESS_SECRET: '  ', DATABASE_URL: undefined });
    expect(erreurs).toEqual(['DATABASE_URL est obligatoire.', 'JWT_ACCESS_SECRET est obligatoire.']);
  });

  it('FRONTEND_URL obligatoire en production seulement', () => {
    expect(diagnostiquerEnvironnement({ ...complet, FRONTEND_URL: undefined }).erreurs).toHaveLength(1);
    expect(diagnostiquerEnvironnement({ ...complet, NODE_ENV: 'development', FRONTEND_URL: undefined }).erreurs).toHaveLength(0);
  });

  it('secrets faibles ou identiques : avertissement, jamais de blocage, jamais la valeur', () => {
    const d = diagnostiquerEnvironnement({ ...complet, JWT_ACCESS_SECRET: 'court', JWT_REFRESH_SECRET: 'court' });
    expect(d.erreurs).toEqual([]);
    expect(d.avertissements).toHaveLength(3);
    expect(d.avertissements.join(' ')).not.toContain('court');
  });

  it('plusieurs processus sans Redis : avertissement', () => {
    expect(diagnostiquerEnvironnement({ ...complet, WEB_CONCURRENCY: '4' }).avertissements).toHaveLength(1);
  });
});
