import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { directivesCsp, empreintesScriptsEnLigne } from '../../../frontend/securite-contenu.js';

/**
 * Politique de sécurité du frontend (SEC-01) : la CSP injectée dans
 * index.html au build, et les en-têtes envoyés par Vercel (production)
 * et Netlify (aperçus).
 */
const RACINE = join(import.meta.dirname, '../../..');
const html = readFileSync(join(RACINE, 'frontend/index.html'), 'utf8');

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(';').map((d) => {
      const [nom, ...valeurs] = d.trim().split(/\s+/);
      return [nom, valeurs];
    }),
  );
}

describe('CSP du frontend', () => {
  const csp = directives(directivesCsp(html, 'https://api.stockflowgn.com', 'https://cle@o1.ingest.de.sentry.io/42'));

  it('jamais de script en ligne libre, d’eval, ni de joker', () => {
    const tout = [...csp.values()].flat();
    expect(tout).not.toContain("'unsafe-inline'");
    expect(tout).not.toContain("'unsafe-eval'");
    expect(tout).not.toContain('*');
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('frame-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
  });

  it('autorise chaque script en ligne de index.html par son empreinte, et rien d’autre', () => {
    const empreintes = empreintesScriptsEnLigne(html);
    expect(empreintes.length).toBeGreaterThan(0);
    expect(csp.get('script-src')).toEqual(["'self'", ...empreintes]);
  });

  it('n’envoie des données qu’à l’API et à Sentry', () => {
    expect(csp.get('connect-src')).toEqual(["'self'", 'https://api.stockflowgn.com', 'https://o1.ingest.de.sentry.io']);
    // Sans configuration : le site lui-même seulement (API servie sous /api).
    expect(directives(directivesCsp(html, undefined, undefined)).get('connect-src')).toEqual(["'self'"]);
  });
});

describe('En-têtes de sécurité des hébergeurs', () => {
  const vercel = JSON.parse(readFileSync(join(RACINE, 'frontend/vercel.json'), 'utf8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const enTetesVercel = Object.fromEntries(vercel.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value]));

  it('Vercel interdit l’encadrement et le reniflage de type', () => {
    expect(enTetesVercel['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    expect(enTetesVercel['X-Frame-Options']).toBe('DENY');
    expect(enTetesVercel['X-Content-Type-Options']).toBe('nosniff');
  });

  it('Netlify (aperçus) envoie exactement les mêmes en-têtes que Vercel', () => {
    const toml = readFileSync(join(RACINE, 'netlify.toml'), 'utf8');
    const bloc = toml.slice(toml.indexOf('[headers.values]'));
    const enTetesNetlify = Object.fromEntries([...bloc.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"([^"]*)"/gm)].map(([, cle, valeur]) => [cle, valeur]));
    expect(enTetesNetlify).toEqual(enTetesVercel);
  });
});
