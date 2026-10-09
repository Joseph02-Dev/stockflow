// Migrations au démarrage, avec diagnostic réseau et nouvelles tentatives.
//
// Pourquoi : une base Neon en veille peut mettre plusieurs secondes à se
// réveiller, et une erreur « P1001 Can't reach database server » ne dit pas
// si le serveur est lent, injoignable, ou joignable seulement en IPv4/IPv6.
// Ce script journalise ce qu'il voit (hôte, adresses, durée de connexion
// TCP), jamais l'identifiant ni le mot de passe, puis lance
// `prisma migrate deploy` jusqu'à TENTATIVES fois.
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

await diagnostiquer();

for (let tentative = 1; tentative <= TENTATIVES; tentative++) {
  journal(`prisma migrate deploy, tentative ${tentative}/${TENTATIVES}`);
  const { status } = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' });
  if (status === 0) process.exit(0);
  if (tentative < TENTATIVES) {
    journal(`échec, nouvelle tentative dans ${PAUSE_MS / 1000} s`);
    await pause(PAUSE_MS);
  }
}
journal('migrations impossibles après toutes les tentatives : arrêt.');
process.exit(1);
