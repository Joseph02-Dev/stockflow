// Migrations au démarrage, avec diagnostic réseau et nouvelles tentatives.
//
// Pourquoi : une base Neon en veille peut mettre plusieurs secondes à se
// réveiller, et une erreur « P1001 Can't reach database server » ne dit pas
// si le serveur est lent, injoignable, ou joignable seulement en IPv4/IPv6.
// Ce script journalise ce qu'il voit (hôte, adresses, durée de connexion
// TCP), jamais l'identifiant ni le mot de passe, puis lance
// `prisma migrate deploy` jusqu'à TENTATIVES fois.
//
// IPv6 sans route (constaté sur Render, 2026-10-09) : les adresses IPv6 de
// Neon échouent en ENETUNREACH, les IPv4 répondent, et le moteur de
// migration de Prisma ne se rabat pas sur l'IPv4 (P1001). Dans ce cas, et
// pour les migrations seulement, la connexion vise directement une adresse
// IPv4 joignable ; l'endpoint Neon est alors désigné par le paramètre
// `options=endpoint=<id>`, méthode documentée par Neon pour les clients
// sans SNI (https://neon.com/docs/connect/connection-errors). Le
// chiffrement TLS (sslmode) est conservé. L'API elle-même (Node.js) se
// rabat d'elle-même sur l'IPv4 et garde l'URL d'origine.
// MIGRATION_FORCER_IPV4=1 impose ce mode pour tout hôte.
//
// Usage : node scripts/migrer.mjs && npm run start:prod
import { spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { setTimeout as pause } from 'node:timers/promises';

const TENTATIVES = Number(process.env.MIGRATION_TENTATIVES ?? 5);
const PAUSE_MS = Number(process.env.MIGRATION_PAUSE_MS ?? 10_000);
const DELAI_TCP_MS = 8_000;

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

/**
 * Diagnostic réseau ; renvoie l'URL à utiliser pour les migrations
 * (l'originale, ou sa variante IPv4 quand l'IPv6 est sans route).
 */
async function diagnostiquer() {
  const origine = process.env.DATABASE_URL ?? '';
  let url;
  try {
    url = new URL(origine);
  } catch {
    journal('DATABASE_URL absente ou illisible.');
    return origine;
  }
  const port = Number(url.port || 5432);
  const parametres = [...url.searchParams.keys()].join(', ') || 'aucun';
  journal(`hôte ${url.hostname}, port ${port}, paramètres : ${parametres}`);
  let ipv4Joignable = null;
  let ipv6SansRoute = false;
  try {
    const adresses = await lookup(url.hostname, { all: true });
    for (const { address, family } of adresses) {
      const resultat = await sonderTcp(address, family, port);
      journal(`IPv${family} ${address} : connexion TCP ${resultat}`);
      if (family === 4 && resultat.startsWith('ouverte')) ipv4Joignable ??= address;
      if (family === 6 && !resultat.startsWith('ouverte')) ipv6SansRoute = true;
    }
  } catch (e) {
    journal(`résolution DNS impossible : ${e.code ?? e.message}`);
  }

  const neon = url.hostname.endsWith('.neon.tech');
  const forcer = process.env.MIGRATION_FORCER_IPV4 === '1';
  if (!ipv4Joignable || !(forcer || (neon && ipv6SansRoute))) return origine;

  const variante = new URL(origine);
  variante.hostname = ipv4Joignable;
  if (neon && !variante.searchParams.has('options')) {
    // Identifiant de l'endpoint : premier segment du nom, sans « -pooler ».
    const endpoint = url.hostname.split('.')[0].replace(/-pooler$/, '');
    variante.searchParams.set('options', `endpoint=${endpoint}`);
    journal(`migrations en IPv4 (${ipv4Joignable}), endpoint Neon ${endpoint}`);
  } else {
    journal(`migrations en IPv4 (${ipv4Joignable})`);
  }
  return variante.toString();
}

const urlMigrations = await diagnostiquer();

for (let tentative = 1; tentative <= TENTATIVES; tentative++) {
  journal(`prisma migrate deploy, tentative ${tentative}/${TENTATIVES}`);
  const { status } = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: urlMigrations },
  });
  if (status === 0) process.exit(0);
  if (tentative < TENTATIVES) {
    journal(`échec, nouvelle tentative dans ${PAUSE_MS / 1000} s`);
    await pause(PAUSE_MS);
  }
}
journal('migrations impossibles après toutes les tentatives : arrêt.');
process.exit(1);
